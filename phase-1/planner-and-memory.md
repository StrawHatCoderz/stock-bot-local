# Phase 1 — Planner and Memory

`tech_stack.md` introduces Planner and Memory in one line each. This doc
expands both, since they're the two Team A components with no Java or UI
analogue — everything either does lives entirely inside the Node backend.

## Why they're separate from the Agent

The Agent's only job is calling the Claude API (via the Claude SDK) with
the current history and the 3 tool schemas. Planner and Memory are split
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
`validate_stock_items` tool call), and it never inspects or modifies tool
arguments — those come from Claude, not from the Planner.

## Memory

**What it does:** holds the conversation history for one session, and is
the only place session auth context lives after `authenticate_user`
succeeds.

Two things live in Memory, appended in strict turn order:

1. **The message array** passed to every Claude API call — user messages,
   Claude's text replies, `tool_use` requests, and the tool results fed
   back in. `testing-strategy.md`'s "Memory tests" assert this append
   order directly: user message → tool call → tool result, repeated
   across a multi-turn session, never reordered or dropped.
2. **The session auth context** — `{user_id, name, role, store_id,
   token}` — captured once from `authenticate_user`'s response and read
   by every later tool call. `store_id` in particular is always read from
   here, never re-derived from user text, which is what lets
   `validate_stock_items` and `submit_zeroisation_request` enforce the
   `STORE_MISMATCH` check honestly (per `api-contract.md`) instead of
   trusting whatever the user typed.

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
