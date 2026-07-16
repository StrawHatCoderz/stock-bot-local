import type { UserMessage } from "../types.js";

export class MessageQueue {
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
      this.waiting(msg);
      this.waiting = null;
    } else {
      this.messages.push(msg);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<UserMessage> {
    while (!this.closed) {
      if (this.messages.length > 0) {
        yield this.messages.shift()!;
      } else {
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
