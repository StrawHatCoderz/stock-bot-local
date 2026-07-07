# Phase 1 — API Contract (Zeroisation)

**Status: frozen for Phase 1.** Changes after the Day 1 freeze need sign-off
from both Team A (Node) and Team B (Java) — this is the single artifact
that lets the two teams build in parallel without blocking each other.

Base payloads carried over from
`docs/superpowers/specs/2026-07-06-stock-platform-chatbot-design.md` §7,
extended here with `token` propagation and the store-scope check.

## Error codes (shared across endpoints)

| Code | HTTP status | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Username/password didn't match |
| `STORE_MISMATCH` | 403 | Token's `store_id` doesn't match the request's `store_id` — request rejected before any item is checked |
| `PRODUCT_NOT_FOUND` | — (per-item, not HTTP-level) | No product matching the given name in this store's catalog |
| `PRODUCT_AMBIGUOUS` | — (per-item) | The given name matches more than one real SKU in this store's catalog (e.g. "milk" matches several sizes) — caller must pick one and re-validate |
| `AREA_AMBIGUOUS` | — (per-item) | No `area_code` was given and the product exists in more than one area of this store, each with its own quantity — caller must pick one and re-validate |
| `ALREADY_ZERO` | — (per-item) | Product exists but current on-hand quantity is already 0 — nothing to write off |

## 1. `authenticate_user` → `POST /api/auth/login`

```json
// Request
{ "username": "priya.k", "password": "***" }

// Response 200
{ "user_id": "U1023", "name": "Priya K", "role": "STORE_MANAGER",
  "store_id": "S045", "token": "mock-token-abc" }

// Response 401
{ "error_code": "INVALID_CREDENTIALS", "message": "Username or password is incorrect." }
```

Fields returned are exactly what's needed and nothing more: `user_id` is
used as `submitted_by` on the Stock API call and in audit logs; `name` is
for UI personalization; `role` and `store_id` scope everything downstream;
`token` ties every subsequent call to this session.

## 2. `list_store_areas` → `GET /api/validation/areas?store_id=...`

Returns the requesting store's areas so Claude can match a vague location
phrase (e.g. "near some x area") against real `description` text — Claude
does the matching itself, this endpoint just supplies real data to match
against (see `tech_stack.md`'s `AreaRepository`). Called only when the
user's message implies a location that needs resolving; most Zeroisation
requests never need it.

```json
// Request
{ "token": "mock-token-abc", "store_id": "S045" }

// Response 200
{ "areas": [
  { "area_code": "DC-1", "name": "Dairy Cooler",
    "description": "Refrigerated section along the back wall" },
  { "area_code": "BR-2", "name": "Backroom Storage",
    "description": "Overflow storage behind the staff door" }
]}

// Response 403 (same store-scope check as the other endpoints)
{ "error_code": "STORE_MISMATCH", "message": "Token is not authorized for store S045." }
```

## 3. `validate_stock_items` → `POST /api/validation/stock-items`

No quantity field anywhere in this contract — Zeroisation writes off
whatever is currently on hand, so there's nothing for the caller to supply.
`area_code` is optional per item — pass it once Claude has resolved a
location phrase via `list_store_areas`; omit it when the user named no
location and let `ValidationAPI` resolve it (see `AREA_AMBIGUOUS` below).

```json
// Request
{ "token": "mock-token-abc", "store_id": "S045", "items": [
  { "product_name": "Milk 1L", "reason": "expired" },
  { "product_name": "Bread", "reason": "damaged" },
  { "product_name": "Eggs", "reason": "damaged", "area_code": "DC-1" }
]}

// Response 200 (store_id matched the token — items checked individually)
{ "results": [
  { "product_name": "Milk 1L", "reason": "expired", "valid": true,
    "product_id": "P8821", "area_code": "DC-1", "area_name": "Dairy Cooler",
    "current_quantity": 5 },
  { "product_name": "Bread", "reason": "damaged", "valid": false,
    "error_code": "PRODUCT_NOT_FOUND",
    "message": "No product matching 'Bread' found in this store's catalog." },
  { "product_name": "Eggs", "reason": "damaged", "valid": true,
    "product_id": "P9101", "area_code": "DC-1", "area_name": "Dairy Cooler",
    "current_quantity": 12 }
]}

// Response 200, stretch fuzzy-match variant (only if that story ships)
{ "results": [
  { "product_name": "Bred", "reason": "damaged", "valid": false,
    "error_code": "PRODUCT_NOT_FOUND", "suggested_product_name": "Bread",
    "message": "No product matching 'Bred' found. Did you mean 'Bread'?" }
]}

// Response 200, ambiguous-match variant (baseline, not stretch — distinct from
// the typo-suggestion variant above: this is multiple *real* SKUs matching a
// generic name, not a near-miss spelling of one)
{ "results": [
  { "product_name": "milk", "reason": "expired", "valid": false,
    "error_code": "PRODUCT_AMBIGUOUS",
    "candidates": [
      { "product_id": "P8821", "product_name": "Milk 500ml" },
      { "product_id": "P8822", "product_name": "Milk 1L" },
      { "product_id": "P8823", "product_name": "Milk Lite" }
    ],
    "message": "Found more than one product matching 'milk'. Which one did you mean?" }
]}

// Response 200, area-ambiguous variant (baseline — same product name exists
// in more than one area and no area_code was given)
{ "results": [
  { "product_name": "Eggs", "reason": "damaged", "valid": false,
    "error_code": "AREA_AMBIGUOUS",
    "candidates": [
      { "area_code": "DC-1", "area_name": "Dairy Cooler",
        "product_id": "P9101", "current_quantity": 12 },
      { "area_code": "BR-2", "area_name": "Backroom Storage",
        "product_id": "P9214", "current_quantity": 30 }
    ],
    "message": "Found Eggs in more than one area. Which one did you mean — Dairy Cooler or Backroom Storage?" }
]}

// Response 200, already-zero variant
{ "results": [
  { "product_name": "Eggs", "reason": "damaged", "valid": false,
    "error_code": "ALREADY_ZERO",
    "message": "Eggs is already at zero stock in this store." }
]}

// Response 403 (store-scope check fails — request rejected before any item is checked)
{ "error_code": "STORE_MISMATCH", "message": "Token is not authorized for store S045." }
```

## 4. `submit_zeroisation_request` → `POST /api/stock/zeroisation`

```json
// Request
{ "token": "mock-token-abc", "store_id": "S045", "submitted_by": "U1023",
  "items": [
    { "product_id": "P8821", "product_name": "Milk 1L", "reason": "expired" },
    { "product_id": "P9032", "product_name": "Bread", "reason": "damaged" }
  ]}

// Response 200
{ "request_id": "ZR-2026-000481", "status": "COMPLETED",
  "processed_at": "2026-07-06T10:15:00Z",
  "items": [
    { "product_id": "P8821", "quantity_zeroed": 5 },
    { "product_id": "P9032", "quantity_zeroed": 2 }
  ]}

// Response 403 (same store-scope check as validate_stock_items)
{ "error_code": "STORE_MISMATCH", "message": "Token is not authorized for store S045." }
```

Only pre-validated items (from step 3) are ever submitted here — the Node
side never calls this with an item that came back `valid: false`. No
`area_code` field is needed here: `product_id` already uniquely identifies
the exact area-specific row once `validate_stock_items` has resolved it,
so there's nothing ambiguous left to pin down at submit time.

## 5. Kafka event (simulated — logged, not published by a running broker)

```json
// Topic: stock.zeroisation.completed
{ "request_id": "ZR-2026-000481", "store_id": "S045", "items": [
  { "product_id": "P8821", "quantity": 5 },
  { "product_id": "P9032", "quantity": 2 }
]}
```
