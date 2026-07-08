# Phase 1 — Planner and Memory

`tech_stack.md` introduces Planner and Memory in one line each. This doc
expands both, since they're the two Team A components with no Java or UI
analogue — everything either does lives entirely inside the Node backend.

## Why they're separate from the Agent

The Agent's only job is calling the Claude API (via the Claude SDK) with
the current history and the 7 tool schemas. Planner and Memory are split
out from that call so each can be unit-tested against canned data, with
no live API calls — exactly the split `testing-strategy.md` relies on for
"Planner routing tests" and "Memory tests."

## Planner

**What it does:** inspects the response that comes back from the Agent's
Claude API call and decides what happens next. There are exactly two
shapes to handle:

1. **Plain text** → send it to the custom web UI, wait for the next user
   message. Turn ends here.
2. **A `tool_use` block** → route the requested tool + its arguments to
   ToolExecutor, take the result, hand it back to Memory and the Agent for
   another Claude call. Turn does not end — it loops.

This is the decision point drawn as the diamond in `phase_1_flowchart.md`'s
"Agent turn loop" diagram (`Planner1{"...does Claude's response include
a tool_use block?"}`). The Planner has no business logic of its own about
*which* tool to call or *what* the reply should say — Claude decides that.
Planner's only responsibility is mechanically routing the response shape
it already got back.

**Why it's testable in isolation:** because it takes a Claude API response
as input and returns a routing decision as output, a test can feed it a
canned response object (no network call) and assert it picked the right
branch — this is what "given canned Claude API responses, assert correct
routing" in `testing-strategy.md` means concretely.

**What it deliberately does not do:** parse free text into structured
line items (that's a separate parsing step feeding into the
`validate_area`/`validate_product` tool calls), and it never inspects or
modifies tool arguments — those come from Claude, not from the Planner.

## Where the "reasoning agent" pattern lives

Recognizing what the user even wants — is this Zeroisation-shaped, or does
it imply a partial quantity (Waste-shaped) or a destination store
(Transfer-shaped), per `phase_1_plan.md`'s "Recognizing intent without a
menu" — free-text entity extraction ("I want to remove eggs from
Refrigerator X because it's damaged" → productName `"eggs"`, areaName
`"Refrigerator X"`), telling a single-product request apart from a
whole-area one ("the whole fridge lost power" → no `productName` at all,
per `phase_1_plan.md`'s "Whole-area zeroization"), guessing a single area
or product name to pass to `validate_area`/`validate_product` and
producing a corrected guess on `AREA_NOT_FOUND`/`PRODUCT_NOT_FOUND`
(there's no candidate list in `api-contract.md` to offer instead — see
that doc's "Note on disambiguation"), mapping the user's own words for
"why" onto a fixed `reason` code for `create_zeroization`/
`create_area_zeroization`, and tracking what's still known vs. missing
before a tool can be called — none of that is Planner logic. It's Claude's
own reasoning, driven by the system prompt and the 7 tool schemas,
re-derived fresh on every turn from whatever is already in the
conversation history.

This is exactly why Memory matters here: because the full history persists
and is replayed on every Claude API call, Claude doesn't need a separate
"known vs. missing" object handed to it — it reconstructs that from the
transcript Memory already holds. Making the agent smarter changes the
system prompt (what to extract, how to map a reason, when to retry a
guess), not the Planner's code. The Planner's job stays exactly what it
was: mechanically route the response Claude already produced.

## Memory

**What it does:** holds the conversation history for one session, and is
the only place session auth context lives after login and `/api/me`
succeed.

Two things live in Memory, appended in strict turn order:

1. **The message array** passed to every Claude API call — user messages,
   Claude's text replies, `tool_use` requests, and the tool results fed
   back in. `testing-strategy.md`'s "Memory tests" assert this append
   order directly: user message → tool call → tool result, repeated
   across a multi-turn session, never reordered or dropped.
2. **The session auth context** — `token` from `authenticate_user`, then
   `{employee_id, employee_number, name, email, assignedTo}` from
   `get_user_details` — captured once and read by every later tool call.
   `assignedTo` (the `storeId`) in particular is always read from here,
   never re-derived from user text, and `employee_id` becomes
   `requestedBy` on `create_zeroization`.

**Why it's built here instead of provided for free:** most agent
frameworks that use MCP get conversation state managed by the MCP host.
This project has no MCP host — the Claude SDK is called directly — so
Memory is a real component Team A owns and writes, not a library default.

**Lifetime:** scoped to one session (one login), not persisted across
sessions in Phase 1. `tech_stack.md`'s repository-interface pattern
(in-memory now, swappable later) applies to the Java-side repositories,
not to Memory — Memory is intentionally simpler, a per-session object
that's discarded when the session ends, since Phase 1 has no
requirement to resume a conversation later.

## How they fit together (one turn)

```
Custom Web UI sends user message
        │
        ▼
Memory: append user message to history
        │
        ▼
Agent: call Claude API with full history + tool schemas
        │
        ▼
Planner: tool_use block, or plain text?
        │
   ┌────┴────┐
   ▼         ▼
 text     tool_use
   │         │
   ▼         ▼
Memory:   ToolExecutor: run the tool
append    │
reply     ▼
   │     Memory: append tool result
   ▼         │
 Send to     └──► back to Agent (loop)
 UI, wait
 for next
 message
```

Full diagram with the business-flow layer on top of this loop:
`phase_1_flowchart.md`, section 1 ("Agent turn loop").
