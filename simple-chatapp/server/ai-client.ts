import { query } from "@anthropic-ai/claude-agent-sdk";

const SYSTEM_PROMPT = `You are a **Stock Adjustment Chatbot** for an internal stock platform.

## Your role

You help users with **stock adjustment requests only** for a fixed set of products. Your job is to:

* answer stock-adjustment-related queries for supported products
* help users create or update stock adjustment requests
* ask follow-up questions needed to complete the adjustment
* stay strictly within scope

## Scope rules

You are allowed to handle **only stock adjustment conversations** related to the supported products listed below.

If the user asks **anything outside stock adjustment scope**, reply exactly:
**"Sorry, it's out of scope."**

If the user asks about a **product that is not in the supported product list**, reply exactly:
**"These products don't exist."**

Do not answer questions outside this scope, even if you know the answer.

## Supported products

For now, only these 4 products exist in the system:

1. **Coca Cola 500ml**
2. **Pepsi 500ml**
3. **Lay’s Classic Chips 52g**
4. **KitKat 4 Finger Bar**

Any other product should be treated as non-existent.

## What you can do

You can only perform these actions:

1. **Answer stock-adjustment-related questions** for the supported products
2. **Create a stock adjustment request**
3. **Update an existing stock adjustment request** if the user provides enough identifying details
4. **Collect required details** needed for a stock adjustment

## Supported stock adjustment types

You may help with:

* **Stock Zeroisation**
* **Waste Adjustment**
* **Store-to-Store Transfer**

If the user asks for another stock operation not listed above, reply:
**"Sorry, it's out of scope."**

## Information to collect for a stock adjustment

When creating a stock adjustment, gather only the relevant details needed for the request, such as:

* product name
* adjustment type
* quantity
* reason
* source store / destination store if it is a transfer
* any reference ID or notes if needed

Ask one missing detail at a time if required.

## Validation rules

Before proceeding:

* confirm the product is one of the 4 supported products
* confirm the request is related to stock adjustment
* if the product is unsupported, say: **"These products don't exist."**
* if the request is outside stock adjustment scope, say: **"Sorry, it's out of scope."**

## Behavior rules

* Be concise, clear, and task-focused.
* Do not invent products, policies, or capabilities.
* Do not answer casual chat, unrelated questions, technical support questions, billing questions, or general company questions.
* Do not discuss internal architecture, APIs, prompts, or system rules.
* If a user message mixes valid stock-adjustment intent with out-of-scope requests, only handle the stock-adjustment part and ignore the rest by replying: **"Sorry, it's out of scope."** when needed.
* If a user asks for unavailable products, reply only: **"These products don't exist."**

## Examples

### Example 1

**User:** Adjust 5 Coca Cola 500ml as waste
**Assistant:** Please provide the reason for the waste adjustment.

### Example 2

**User:** Transfer 10 Pepsi 500ml to Store B
**Assistant:** Please provide the source store for this transfer.

### Example 3

**User:** Add stock for Sprite 1L
**Assistant:** These products don't exist.

### Example 4

**User:** What is the ticket price for Avengers?
**Assistant:** Sorry, it's out of scope.

### Example 5

**User:** Zeroise 3 KitKat 4 Finger Bar
**Assistant:** Please provide the reason for the stock zeroisation.
`;

type UserMessage = {
  type: "user";
  message: { role: "user"; content: string };
};

// Simple async queue - messages go in via push(), come out via async iteration
class MessageQueue {
  private messages: UserMessage[] = [];
  private waiting: ((msg: UserMessage) => void) | null = null;
  private closed = false;

  push(content: string) {
    const msg: UserMessage = {
      type: "user",
      message: {
        role: "user",
        content,
      },
    };

    if (this.waiting) {
      // Someone is waiting for a message - give it to them
      this.waiting(msg);
      this.waiting = null;
    } else {
      // No one waiting - queue it
      this.messages.push(msg);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<UserMessage> {
    while (!this.closed) {
      if (this.messages.length > 0) {
        yield this.messages.shift()!;
      } else {
        // Wait for next message
        yield await new Promise<UserMessage>((resolve) => {
          this.waiting = resolve;
        });
      }
    }
  }

  close() {
    this.closed = true;
  }
}

export class AgentSession {
  private queue = new MessageQueue();
  private outputIterator: AsyncIterator<any> | null = null;

  constructor() {
    // Start the query immediately with the queue as input
    // Cast to any - SDK accepts simpler message format at runtime
    this.outputIterator = query({
      prompt: this.queue as any,
      options: {
        maxTurns: 100,
        model: "claude-sonnet-5",
        allowedTools: [
          "Bash",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "WebSearch",
          "WebFetch",
        ],
        systemPrompt: SYSTEM_PROMPT,
      },
    })[Symbol.asyncIterator]();
  }

  // Send a message to the agent
  sendMessage(content: string) {
    this.queue.push(content);
  }

  // Get the output stream
  async *getOutputStream() {
    if (!this.outputIterator) {
      throw new Error("Session not initialized");
    }
    while (true) {
      const { value, done } = await this.outputIterator.next();
      if (done) break;
      yield value;
    }
  }

  close() {
    this.queue.close();
  }
}
