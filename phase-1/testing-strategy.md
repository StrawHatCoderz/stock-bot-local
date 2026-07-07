# Phase 1 — Testing Strategy

Testing is mandatory for Phase 1 — this doc is the sprint's definition of
done, not optional polish.

## Node unit tests (Team A)

- **Tool schema tests**: explicit assertion that `validate_stock_items`
  and `submit_zeroisation_request` payloads never contain a quantity
  field, even when a scripted user message states a number (e.g., "1000
  eggs broken" must still produce `{product_name: "eggs", reason:
  "damaged"}` with no quantity anywhere).
- **Planner routing tests**: given canned Claude API responses (no live
  API calls in unit tests), assert correct routing — `tool_use` block →
  ToolExecutor; plain text → sent to UI.
- **Memory tests**: correct append order for user messages, tool calls,
  and tool results across a multi-turn session.
- **Free-text parsing tests**: scripted user utterances → expected
  structured line items.

## Java unit tests (Team B)

- **AuthAPI**: valid/invalid credentials, token issuance, password never
  appears in logs.
- **ValidationAPI**: product found, `PRODUCT_NOT_FOUND`, `ALREADY_ZERO`,
  `STORE_MISMATCH`, and the stretch fuzzy-match case if it ships.
- **StockAPI**: zero-out logic, `request_id` generation, correct
  `quantity_zeroed` per item.
- **Repository tests**: `InMemory*` implementations behave correctly —
  doubles as a contract smoke-test that a later real-DB swap preserves
  behavior.
- **Kafka payload-builder tests** and **log-line assertion tests**
  (structured fields present, via a log-capturing test appender).

## Contract-based integration tests (cross-team)

No Pact or similar framework, given the 2-week timeline — instead,
`api-contract.md` plus a small set of checked-in example request/response
JSON fixtures (already largely written into that doc) are what both
sides' tests load. Team A's integration suite starts a real local Spring
Boot instance and runs `ToolExecutor` against it for the happy path and
every error code in the contract.

## Scripted E2E conversational test

A harness drives the agent through a fixed conversation script — login →
select Zeroisation → "eggs are damaged" → confirm — and asserts the final
`StockAPI` call and the `zeroisation_submitted`/`kafka_event_published`
log lines match expectations. Uses a fake/deterministic Claude client in
CI (fast, free, no flakiness); an optional nightly run exercises the real
Claude API. Team A owns and builds the harness (it lives in the Agent
layer); Team B contributes the error-path scripts (product-not-found,
already-zero, store-mismatch), since those are validation-rule-driven.

## Ownership & cadence

- Each team unit-tests its own layer on every PR (CI gate).
- Contract fixtures frozen by end of Day 1/2 — nothing in this strategy
  can start in earnest before that.
- **Checkpoint #1 (end of Week 1)**: joint integration test — happy-path
  E2E against real services, not stubs.
- **Checkpoint #2 (end of Week 2)**: full scripted suite — happy path +
  2 or more error/recovery paths + logging assertions. This is the
  sprint's definition of done.
