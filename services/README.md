# Mock Backend Services

Four independent Spring Boot apps (Java 21, Gradle multi-project build:
`auth-service`, `validation-service`, `stock-service`, `transfer-service`)
behind an nginx gateway. There is no database — each service holds its own
hardcoded, in-memory `Mock*Data`, and each service is plain controllers with
no repository/service layering. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
for identity flow, RBAC, and the Transfer lifecycle.

## Running

All four together, behind the gateway:

```bash
docker-compose up --build
```

The gateway is the only container that publishes a host port —
**`http://localhost:8080`**. The four backend containers aren't reachable
directly in this mode.

Or run each service individually with Gradle, hitting each port directly
(no gateway):

```bash
./gradlew :auth-service:bootRun        # :8081
./gradlew :validation-service:bootRun  # :8082
./gradlew :stock-service:bootRun       # :8083
./gradlew :transfer-service:bootRun    # :8084
```

Test a single service: `./gradlew :auth-service:test` (no test sources exist
under any service yet — the task runs but has nothing to execute).

## Services

| Service | Port | Package | Owns |
|---|---|---|---|
| `auth-service` | 8081 | `com.stockcorrection.auth` | Login, identity verification, manager/associate roster, associate thresholds |
| `validation-service` | 8082 | `com.stockcorrection.validation` | Area/product existence and fuzzy search |
| `stock-service` | 8083 | `com.stockcorrection.stock` | On-hand quantities, zeroisation, adjustment, transfer reserve/credit |
| `transfer-service` | 8084 | `com.stockcorrection.transfer` | Transfer request lifecycle (create, list, approve) |

`validation-service` and `stock-service` each hardcode their own copy of the
same store/area/product IDs (`MockValidationData`/`MockStockData`) — keep
those in sync by hand if you add mock data. `transfer-service` hardcodes its
own, smaller copy too (`MockStoreData`, just the set of recognized store
IDs).

Every endpoint except login is gated by a `TokenAuthFilter` that re-verifies
the bearer token against `auth-service`'s `GET /api/auth/verify` on every
request — `storeId`/`role`/`employeeId` are never trusted from the caller.
Business failures (e.g. `AREA_NOT_FOUND`, `FORBIDDEN_ROLE`) are ordinary
HTTP 200 bodies with an `errorCode` field, not 4xx responses — only a
genuine network/transport failure is a non-200.

## Test accounts (`MockAuthData.java`, all password `password123`)

| username | role | assigned store | exercises |
|---|---|---|---|
| `user001` | STORE_MANAGER | STORE-101 | happy path |
| `user002` | STORE_MANAGER | STORE-102 | happy path, different store's data |
| `user003` | STORE_ASSOCIATE | *(none)* | `UNAUTHORIZED_MANAGER` at login (`GET /api/me`) |
| `user004` | STORE_ASSOCIATE | STORE-101 | passes login; `FORBIDDEN_ROLE` on zeroisation, but can use `create_adjustment` (seeded threshold 5%) |
| `user005` | STORE_ASSOCIATE | STORE-102 | second associate (seeded threshold 12%), for exercising per-associate threshold independence |
| `user006` | ADMIN | *(none — system-wide)* | passes login despite no `assignedTo` store; can list managers/associates and set thresholds; cannot call any stock-mutation tool |

## Project layout

```
services/
├── auth-service/        # login, identity verification, roster, thresholds
├── validation-service/   # area/product existence + fuzzy search
├── stock-service/        # quantities, zeroisation, adjustment, transfer reserve/credit
├── transfer-service/     # transfer request lifecycle
├── api-gateway/           # nginx.conf routing all four services under :8080
└── docker-compose.yml     # brings up all five together
```
