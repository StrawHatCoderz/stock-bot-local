# Phase 1 — API Contract (Zeroisation)

**Status: frozen for Phase 1.** Changes after the Day 1 freeze need sign-off
from both Team A (Node) and Team B (Java) — this is the single artifact
that lets the two teams build in parallel without blocking each other.

These are the exact mock API signatures Phase 1 builds against — seven
endpoints across three services (Auth, Validation, Stock). Business
failures are returned as ordinary `200` bodies with a flag
(`exists`/`authorized`/`status`) plus an `errorCode`, not HTTP error
statuses — none of the given failure shapes use a non-200 status, so
ToolExecutor should treat the body shape, not the HTTP status, as the
source of truth for success/failure.

## Example flow this contract supports

> Store manager: "I want to remove eggs from Refrigerator X because it's
> damaged."

1. `GET /api/me` (token from login) → confirms the employee is an
   authorized manager and gets their `assignedTo` store.
2. `POST /api/validation/area` `{storeId, areaName: "Refrigerator X"}` →
   confirms the area exists, gets `areaId`.
3. `POST /api/validation/product` `{storeId, areaId, productName: "eggs"}`
   → confirms eggs are stocked in that specific area, gets `productId`.
4. `GET /api/stock?storeId&areaId&productId` → gets `availableQuantity`
   (this is what "damaged" zeroes out — Claude never asks the user for a
   number).
5. Agent confirms with the user before acting: "I found 120 BOX of eggs in
   Refrigerator X — zero them out?"
6. `POST /api/stock/zeroization` with `quantity` set to the
   `availableQuantity` just read, `reason` mapped from the user's free
   text to a reason code, `remarks` carrying the original free text, and
   `requestedBy` set to the employee's id.

## Example flow: zeroising a whole area

> Store manager: "The whole dairy fridge lost power overnight — zero
> everything in it."

1. `GET /api/me` → same as above.
2. `POST /api/validation/area` `{storeId, areaName: "Dairy"}` → `areaId`.
3. No `productName` this time — the user means every product in the area,
   not one. `GET /api/stock?storeId&areaId` (no `productId`) → the list of
   every product currently stocked there, each with its own
   `availableQuantity`.
4. Agent confirms the whole list before acting: "This will zero out 4
   products in Dairy: Eggs (120 BOX), Milk 1L (40 BOX), ... — proceed?"
5. `POST /api/stock/zeroization/area` with `reason`/`remarks` describing
   the one shared cause (e.g. `POWER_FAILURE`), `requestedBy` set to the
   employee's id — no per-product `quantity` is sent; the server zeroes
   whatever `GET /api/stock` already reported for every product in that
   area.

## 1. Login → `POST /api/login`

```json
// Request
{ "username": "priya.k", "password": "***" }

// Response
{ "token": "jwt-token" }
```

No failure shape is specified for bad credentials in the given contract —
flagged as an open gap; Team B needs to confirm the shape before Day 1
freeze (a `401` or a body-level error, consistent with how every other
endpoint here signals failure, is the natural guess but isn't decided).

## 2. User details → `GET /api/me`

Called right after login to check the employee is an authorized store
manager and to get the store they're scoped to. Token is sent via the
auth header (`Authorization: Bearer <token>`), not a JSON body.

```json
// Response (authorized)
{ "authorized": true, "employee_id": "EMP-1001",
  "employee_number": "1001", "name": "Priya K",
  "email": "priya.k@example.com", "assignedTo": "STORE-101" }

// Response (not an authorized manager for any store)
{ "authorized": false, "errorCode": "UNAUTHORIZED_MANAGER",
  "message": "Employee is not authorized for this store." }
```

`assignedTo` is the `storeId` used on every subsequent call — it, and
`employee_id` (used as `requestedBy` on the zeroization request), come
from `/api/me`, not from the login response. `UNAUTHORIZED_MANAGER` is
reused wherever an employee turns out not to be authorized for a given
store, not just here.

## 3. Validate Area Exists → `POST /api/validation/area`

```json
// Request
{ "storeId": "STORE-101", "areaName": "Dairy" }

// Response (found)
{ "exists": true, "areaId": "AREA-10", "storageType": "REFRIGERATOR" }

// Response (not found)
{ "exists": false, "errorCode": "AREA_NOT_FOUND", "message": "Area does not exist." }
```

`areaName` is matched exactly against this store's areas — there's no
"list all areas" endpoint in this contract for Claude to reason over
loosely worded location phrases against, unlike the candidate-list
pattern used elsewhere in this project's docs (see "Note on
disambiguation" below). Claude has to produce its single best guess at
the area name and retry on `AREA_NOT_FOUND`. `storageType` (e.g.
`REFRIGERATOR`) is informational — useful for the agent's confirmation
message, not used for any validation logic.

## 4. Validate Product Exists → `POST /api/validation/product`

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "productName": "Eggs" }

// Response (found)
{ "exists": true, "productId": "PROD-501", "sku": "SKU-100501" }

// Response (not found)
{ "exists": false, "errorCode": "PRODUCT_NOT_FOUND",
  "message": "Product does not exist in the specified area." }
```

Product existence is checked **within the already-validated area**, not
store-wide and not globally — `PRODUCT_NOT_FOUND` here specifically means
"not in this area," per the message text. As with area validation, this
contract has no candidate list for an ambiguous name (e.g. "milk" matching
several sizes) — Claude names one product and retries on
`PRODUCT_NOT_FOUND` if wrong. Note: Phase 1 initially lacked a candidate list, but `search` endpoints have since been added to resolve this.

## 4a. Fuzzy Search Areas → `GET /api/validation/area/search`

```
Query params: storeId=STORE-101&q=fridge
```

```json
// Response
{
  "candidates": [
    { "areaId": "AREA-10", "areaName": "Refrigerator X", "storageType": "REFRIGERATOR" }
  ]
}
```

## 4b. Fuzzy Search Products → `GET /api/validation/product/search`

```
Query params: storeId=STORE-101&areaId=AREA-10&q=eggs
```

```json
// Response
{
  "candidates": [
    { "productId": "PROD-501", "sku": "SKU-100501", "productName": "Eggs" }
  ]
}
```
# Stock Service

## 5. Get Current Stock → `GET /api/stock`

`productId` is optional. With it, this returns one product's quantity;
without it, this returns every product currently stocked in the area —
that's what backs "zeroise the whole area" (see the example flow above),
since the agent needs the full list before it can confirm or zero
anything area-wide.

```
Query params (single product): storeId=STORE-101&areaId=AREA-10&productId=PROD-501
Query params (whole area):      storeId=STORE-101&areaId=AREA-10
```

```json
// Response (single product)
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "availableQuantity": 120, "unit": "BOX" }

// Response, no stock available (not an error shape — same fields, zero quantity)
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "availableQuantity": 0 }

// Response (whole area, productId omitted)
{ "storeId": "STORE-101", "areaId": "AREA-10", "products": [
  { "productId": "PROD-501", "sku": "SKU-100501", "productName": "Eggs",
    "availableQuantity": 120, "unit": "BOX" },
  { "productId": "PROD-502", "sku": "SKU-100502", "productName": "Milk 1L",
    "availableQuantity": 40, "unit": "BOX" }
]}

// Response, area has no products (not an error shape — empty list)
{ "storeId": "STORE-101", "areaId": "AREA-10", "products": [] }
```

`availableQuantity` (single-product form) is what gets echoed to the user
for confirmation and is exactly what `quantity` on `create_zeroization`
must equal — this is the value that makes "no quantity is ever asked of
the user" true: Claude reads it here, it never comes from user text.
`availableQuantity: 0` isn't a distinct error code; the agent checks the
value itself and tells the user there's nothing to zero out. Same idea
for the whole-area form's empty `products: []`.

## 6. Create Zeroization → `POST /api/stock/zeroization`

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "quantity": 120, "reason": "SPOILED",
  "remarks": "Refrigerator damaged due to electrical power failure.",
  "requestedBy": "EMP-1001" }

// Response (success)
{ "zeroizationId": "ZERO-90001", "status": "SUCCESS",
  "transactionId": "TXN-88292", "message": "Stock successfully zeroized." }

// Response (failure)
{ "status": "FAILED", "errorCode": "ZEROIZATION_FAILED",
  "message": "Unable to create zeroization." }
```

`reason` is a fixed code (`SPOILED` shown; the full enum isn't specified
in the given contract — Team B needs to confirm the set before Day 1
freeze), not free text — Claude maps whatever the user actually said
("damaged," "went bad," "power cut") onto one of these codes. `remarks`
carries the user's original free text so nothing is lost in that mapping.
`requestedBy` is the `employee_id` from `/api/me`.

## 7. Create Area Zeroization → `POST /api/stock/zeroization/area`

Zeroes every product in an area in one call, for "the whole fridge is
out" scenarios — the single-product endpoint above would otherwise need
one call per product. No `quantity` field: it isn't the caller's to
state, same reasoning as the single-product endpoint, just applied to
every product in the area at once using whatever `GET /api/stock`
(area-wide form) already reported.

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "reason": "POWER_FAILURE",
  "remarks": "Refrigerator lost power overnight; entire contents spoiled.",
  "requestedBy": "EMP-1001" }

// Response (success)
{ "zeroizationId": "ZERO-90002", "status": "SUCCESS",
  "transactionId": "TXN-88300",
  "items": [
    { "productId": "PROD-501", "sku": "SKU-100501", "quantityZeroed": 120 },
    { "productId": "PROD-502", "sku": "SKU-100502", "quantityZeroed": 40 }
  ],
  "message": "Stock successfully zeroized for all products in area." }

// Response (failure)
{ "status": "FAILED", "errorCode": "ZEROIZATION_FAILED",
  "message": "Unable to create zeroization." }
```

One `reason`/`remarks` pair applies to every product zeroed — this
endpoint is for a single shared cause across the area (a power failure, a
health-code shutdown), not a way to batch unrelated per-product reasons in
one call. If the user gives different reasons for different products in
the same area, that's still one `create_zeroization` call per product, not
this endpoint. **This endpoint isn't in the failure-response set given
for the original six endpoints** — reusing `ZEROIZATION_FAILED` here is
this doc's assumption, not something confirmed with Team B yet.

## Note on disambiguation

Area and product validation are single-guess-and-retry (`AREA_NOT_FOUND` /
`PRODUCT_NOT_FOUND` only) — there's no candidate-list endpoint for Claude
to turn into a pick-one question. `phase_1_plan.md`, `tech_stack.md`,
`phase_1_flowchart.md`, and `planner-and-memory.md` have been updated to
match this (an earlier draft of those docs assumed
`PRODUCT_AMBIGUOUS`/`AREA_AMBIGUOUS` responses with candidates, which this
contract doesn't support).
