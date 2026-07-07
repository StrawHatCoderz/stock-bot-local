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

## 2. `validate_stock_items` → `POST /api/validation/stock-items`

No quantity field anywhere in this contract — Zeroisation writes off
whatever is currently on hand, so there's nothing for the caller to supply.

```json
// Request
{ "token": "mock-token-abc", "store_id": "S045", "items": [
  { "product_name": "Milk 1L", "reason": "expired" },
  { "product_name": "Bread", "reason": "damaged" }
]}

// Response 200 (store_id matched the token — items checked individually)
{ "results": [
  { "product_name": "Milk 1L", "reason": "expired", "valid": true,
    "product_id": "P8821", "current_quantity": 5 },
  { "product_name": "Bread", "reason": "damaged", "valid": false,
    "error_code": "PRODUCT_NOT_FOUND",
    "message": "No product matching 'Bread' found in this store's catalog." }
]}

// Response 200, stretch fuzzy-match variant (only if that story ships)
{ "results": [
  { "product_name": "Bred", "reason": "damaged", "valid": false,
    "error_code": "PRODUCT_NOT_FOUND", "suggested_product_name": "Bread",
    "message": "No product matching 'Bred' found. Did you mean 'Bread'?" }
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

## 3. `submit_zeroisation_request` → `POST /api/stock/zeroisation`

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

Only pre-validated items (from step 2) are ever submitted here — the Node
side never calls this with an item that came back `valid: false`.

## 4. Kafka event (simulated — logged, not published by a running broker)

```json
// Topic: stock.zeroisation.completed
{ "request_id": "ZR-2026-000481", "store_id": "S045", "items": [
  { "product_id": "P8821", "quantity": 5 },
  { "product_id": "P9032", "quantity": 2 }
]}
```
