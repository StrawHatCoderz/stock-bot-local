import type { WSClient } from "./types.js";
import { AgentSession } from "./ai-client.js";
import { chatStore } from "./chat-store.js";

// Session manages a single chat conversation with a long-lived agent
export class Session {
  public readonly chatId: string;
  private subscribers: Set<WSClient> = new Set();
  private agentSession: AgentSession;
  private isListening = false;

  constructor(chatId: string) {
    this.chatId = chatId;
    // Identity comes from the chat record, set once at POST /api/chats time
    // from the login response — not re-derived here.
    const identity = chatStore.getChat(chatId)?.identity;
    this.agentSession = new AgentSession(identity);
  }

  private async startListening() {
    if (this.isListening) return;
    this.isListening = true;

    try {
      for await (const message of this.agentSession.getOutputStream()) {
        this.handleSDKMessage(message);
      }
    } catch (error) {
      console.error(`Error in session ${this.chatId}:`, error);
      this.broadcastError((error as Error).message);
    }
  }

  sendMessage(content: string) {
    chatStore.addMessage(this.chatId, {
      role: "user",
      content,
    });

    this.broadcast({
      type: "user_message",
      content,
      chatId: this.chatId,
    });

    // Send to agent first (this starts the session if needed)
    this.agentSession.sendMessage(content);

    if (!this.isListening) {
      this.startListening();
    }
  }

  private handleSDKMessage(message: any) {
    switch (message.type) {
      case "assistant":
        this.handleAssistantMessage(message);
        break;
      case "result":
        this.handleResultMessage(message);
        break;
    }
  }

  private handleAssistantMessage(message: any) {
    const content = message.message.content;
    const blocks = typeof content === "string"
      ? [{ type: "text", text: content }]
      : content;

    for (const block of blocks) {
      this.handleAssistantBlock(block);
    }
  }

  private handleAssistantBlock(block: any) {
    switch (block.type) {
      case "text":
        this.persistAndBroadcastText(block.text);
        break;
      case "tool_use":
        this.broadcast({
          type: "tool_use",
          toolName: block.name,
          toolId: block.id,
          toolInput: block.input,
          chatId: this.chatId,
        });
        break;
    }
  }

  private persistAndBroadcastText(text: string) {
    chatStore.addMessage(this.chatId, {
      role: "assistant",
      content: text,
    });
    this.broadcast({
      type: "assistant_message",
      content: text,
      chatId: this.chatId,
    });
  }

  private handleResultMessage(message: any) {
    this.broadcast({
      type: "result",
      success: message.subtype === "success",
      chatId: this.chatId,
      cost: message.total_cost_usd,
      duration: message.duration_ms,
    });
  }

  subscribe(client: WSClient) {
    this.subscribers.add(client);
    client.sessionId = this.chatId;
  }

  unsubscribe(client: WSClient) {
    this.subscribers.delete(client);
  }

  private broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    for (const client of this.subscribers) {
      try {
        if (client.readyState === client.OPEN) {
          client.send(messageStr);
        }
      } catch (error) {
        console.error("Error broadcasting to client:", error);
        this.subscribers.delete(client);
      }
    }
  }

  private broadcastError(error: string) {
    this.broadcast({
      type: "error",
      error,
      chatId: this.chatId,
    });
  }

  close() {
    this.agentSession.close();
  }
}
