# Phase 1 — Zeroisation Flowchart

Same proven style as `docs/superpowers/specs/2026-07-06-stock-platform-chatbot-zeroisation-flowchart-custom-ui.md`:
single top-to-bottom chains, color-coded by tech-stack layer, no
side-by-side lanes — that's what avoids crossing edges. Three diagrams:
the generic agent-turn loop, the main business flow, and the stretch
fuzzy-match sub-flow (kept separate so it doesn't force a second feedback
loop into the main chain).

## Tech stack per layer (color legend)

| Color | Layer | Tech | Role |
|---|---|---|---|
| 🟡 pale yellow | Custom Web UI | Browser (HTML/JS) | Renders chat, sends user input, displays replies |
| 🟦 blue | Agent + Planner + Memory | Node.js backend, Claude API via Claude SDK | Calls Claude API with history + tool schemas; Planner decides reply-vs-tool-call; Memory holds conversation history |
| 🟪 purple | ToolExecutor | Node.js | `authenticate_user`, `validate_stock_items`, `submit_zeroisation_request` |
| 🟩 green | Mock API service | Java Spring Boot | AuthAPI, ValidationAPI, StockAPI — in-memory, production-shaped |
| 🟨 gold (diamond) | — | — | Decision point |
| 🟥 pink (hexagon) | Event bus | Kafka (simulated) | `stock.zeroisation.completed` topic |

## 1. Agent turn loop

Every conversational step in the business flow below runs through this —
not redrawn at each step, to keep the main diagram readable.

```mermaid
flowchart TD
    In(["Custom Web UI sends user message"]) --> Mem1["Memory: append user message to conversation history"]
    Mem1 --> Agent1["Agent: call Claude API (Claude SDK) with full history + tool schemas"]
    Agent1 --> Planner1{"Planner: does Claude's response include a tool_use block?"}
    Planner1 -->|"No - plain text"| Mem2["Memory: append Claude's text reply"] --> Out(["Send reply to Custom Web UI, wait for next user message"])
    Planner1 -->|"Yes - tool_use"| Exec["ToolExecutor: run the requested tool"] --> Mem3["Memory: append tool result"] --> Agent1

    classDef uiLayer fill:#FFF3B0,stroke:#7a6500,stroke-width:2px,color:#3a2f00
    classDef agentLayer fill:#87CEEB,stroke:#1a4f66,stroke-width:2px,color:#04283a
    classDef toolLayer fill:#B39DDB,stroke:#4a2c82,stroke-width:2px,color:#1f0f38
    classDef decision fill:#FFD54F,stroke:#7a5c00,stroke-width:2px,color:#3a2c00

    class In,Out uiLayer
    class Mem1,Mem2,Mem3,Agent1 agentLayer
    class Exec toolLayer
    class Planner1 decision
```

## 2. Zeroisation business flow

Adds a store-scope-authorization decision (separate from "product
valid?") that wasn't in the earlier brainstorming version of this
flowchart, per `api-contract.md`'s `STORE_MISMATCH` check.

```mermaid
flowchart TD
    Start(["User opens custom web chat UI"]) --> Auth

    Auth["Ask for username / password<br/>(runs through Agent turn loop above)"] --> ToolAuth
    ToolAuth["ToolExecutor: authenticate_user"] --> AuthAPI
    AuthAPI[("Spring Boot: AuthAPI")] --> AuthOK{"Authenticated?"}
    AuthOK -->|"No: 401 INVALID_CREDENTIALS"| Reject["Reply: invalid credentials, no options shown"] --> End1(["End"])
    AuthOK -->|"Yes: 200 user_id, role, store_id, token"| Options

    Options["List preset options:<br/>1 Zeroisation (enabled) - 2 Waste Adjustment - 3 Transfer (coming soon)"] --> SelectZero
    SelectZero["User selects Zeroisation"] --> AskItems
    AskItems["Ask: which items, and why? (no quantity)"] --> ParseItems
    ParseItems["Parse free text into line items: product + reason"] --> ToolValidate

    ToolValidate["ToolExecutor: validate_stock_items"] --> ValidationAPI
    ValidationAPI[("Spring Boot: ValidationAPI")] --> StoreOK{"Store-scope OK?<br/>token store_id == request store_id"}
    StoreOK -->|"No: 403 STORE_MISMATCH"| RejectStore["Reply: not authorized for this store<br/>(logged as security event)"] --> End3(["End"])
    StoreOK -->|"Yes"| AllValid{"All items valid?<br/>(product exists, not already zero)"}

    AllValid -->|"No: PRODUCT_NOT_FOUND / ALREADY_ZERO<br/>(see stretch sub-flow for fuzzy-match handling)"| ReportInvalid["Report invalid item(s) and why"]
    ReportInvalid --> AskFix["Ask user to correct or drop invalid item(s)"]
    AskFix -->|"corrected item(s)"| ToolValidate

    AllValid -->|"Yes: results all valid"| ConfirmItems
    ConfirmItems["Show discovered on-hand quantity per item,<br/>ask user to confirm before zeroing"] -->|"user confirms"| ToolSubmit
    ToolSubmit["ToolExecutor: submit_zeroisation_request"] --> StockAPI
    StockAPI[("Spring Boot: StockAPI")] -->|"200 request_id, status COMPLETED"| Kafka
    Kafka{{"Kafka topic: stock.zeroisation.completed (simulated)"}} -->|"event consumed downstream"| Confirm
    Confirm["Show final confirmation to user"] --> End2(["End"])

    classDef uiLayer fill:#FFF3B0,stroke:#7a6500,stroke-width:2px,color:#3a2f00
    classDef agentLayer fill:#87CEEB,stroke:#1a4f66,stroke-width:2px,color:#04283a
    classDef toolLayer fill:#B39DDB,stroke:#4a2c82,stroke-width:2px,color:#1f0f38
    classDef apiLayer fill:#90EE90,stroke:#1f5c1f,stroke-width:2px,color:#0d2b0d
    classDef decision fill:#FFD54F,stroke:#7a5c00,stroke-width:2px,color:#3a2c00
    classDef eventLayer fill:#F8BBD0,stroke:#88134f,stroke-width:2px,color:#4a0a2c

    class Start,End1,End2,End3 uiLayer
    class Auth,Options,SelectZero,AskItems,ParseItems,ConfirmItems,ReportInvalid,AskFix,Confirm,Reject,RejectStore agentLayer
    class ToolAuth,ToolValidate,ToolSubmit toolLayer
    class AuthAPI,ValidationAPI,StockAPI apiLayer
    class AuthOK,AllValid,StoreOK decision
    class Kafka eventLayer
```

## 3. Stretch: fuzzy-match sub-flow (optional, droppable)

What happens inside "Report invalid item(s) and why" above, **only if**
the fuzzy-match stretch story ships (see `phase_1_plan.md`'s cut line).
Kept as its own small diagram rather than a second feedback loop in the
main chain above, to keep that chain crossing-free.

```mermaid
flowchart TD
    Entry(["PRODUCT_NOT_FOUND for an item"]) --> FuzzyCheck{"Fuzzy match found in catalog?"}
    FuzzyCheck -->|"Yes"| Suggest["Suggest closest catalog name,<br/>ask user to confirm"]
    Suggest -->|"user confirms"| Revalidate(["Re-validate with corrected name<br/>(rejoins main flow at validate_stock_items)"])
    FuzzyCheck -->|"No"| Fallback(["Fall back to manual correction<br/>(main flow's 'ask user to correct or drop')"])

    classDef uiLayer fill:#FFF3B0,stroke:#7a6500,stroke-width:2px,color:#3a2f00
    classDef agentLayer fill:#87CEEB,stroke:#1a4f66,stroke-width:2px,color:#04283a
    classDef decision fill:#FFD54F,stroke:#7a5c00,stroke-width:2px,color:#3a2c00

    class Entry,Revalidate,Fallback uiLayer
    class Suggest agentLayer
    class FuzzyCheck decision
```
