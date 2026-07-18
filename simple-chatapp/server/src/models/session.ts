import type { WSClient } from "../types.js";
import { AgentSession } from "./agent-session.js";
import { chatStore } from "./chat-store.js";

const MUTATION_TOOLS = new Set([
  "mcp__stock-mcp__create_zeroization",
  "mcp__stock-mcp__create_area_zeroization",
  "mcp__stock-mcp__create_adjustment",
  "mcp__admin-mcp__set_associate_threshold",
]);

export class Session {
  public readonly chatId: string;
  private subscribers: Set<WSClient> = new Set();
  private agentSession: AgentSession;
  private isListening = false;
  private pendingConfirmation: ((confirmed: boolean) => void) | null = null;
  private pendingRestart = false;

  constructor(chatId: string) {
    this.chatId = chatId;
    const identity = chatStore.getChat(chatId)?.identity;
    this.agentSession = new AgentSession(identity);
  }

  private async startListening() {
    if (this.isListening) return;
    this.isListening = true;

    try {
      for await (const message of this.agentSession.getOutputStream()) {
        const cancelled = await this.handleSDKMessage(message);
        if (cancelled) break;
      }
    } catch (error) {
      console.error(`Error in session ${this.chatId}:`, error);
      this.broadcastError((error as Error).message);
    } finally {
      this.isListening = false;
      if (this.pendingRestart) {
        this.pendingRestart = false;
        this.startListening();
      }
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

    this.agentSession.sendMessage(content);

    if (!this.isListening) {
      this.startListening();
    }
  }

  // Returns true if the loop should break (i.e. action was cancelled)
  private async handleSDKMessage(message: any): Promise<boolean> {
    switch (message.type) {
      case "assistant":
        return await this.handleAssistantMessage(message);
      case "result":
        this.handleResultMessage(message);
        return false;
      default:
        return false;
    }
  }

  private async handleAssistantMessage(message: any): Promise<boolean> {
    const content = message.message.content;
    const blocks: any[] = typeof content === "string"
      ? [{ type: "text", text: content }]
      : content;

    for (const block of blocks) {
      this.handleAssistantBlock(block);
    }

    const mutationBlock = blocks.find(
      (b) => b.type === "tool_use" && MUTATION_TOOLS.has(b.name)
    );

    if (mutationBlock) {
      const confirmed = await this.awaitConfirmation(
        mutationBlock.name,
        mutationBlock.input
      );
      if (!confirmed) {
        this.handleCancellation();
        return true;
      }
    }

    return false;
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

  private awaitConfirmation(toolName: string, toolInput: any): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingConfirmation = resolve;
      this.broadcast({
        type: "pending_action",
        toolName,
        toolInput,
        chatId: this.chatId,
      });
    });
  }

  resolveConfirmation(confirmed: boolean) {
    if (this.pendingConfirmation) {
      const resolve = this.pendingConfirmation;
      this.pendingConfirmation = null;
      resolve(confirmed);
    }
  }

  private handleCancellation() {
    this.broadcast({
      type: "action_cancelled",
      chatId: this.chatId,
    });

    this.agentSession.close();
    const identity = chatStore.getChat(this.chatId)?.identity;
    this.agentSession = new AgentSession(identity);
    // Inject context for the new session without surfacing it as a user message
    this.agentSession.sendMessage(
      "The user has cancelled this action. Please acknowledge the cancellation briefly and let them know the action was not performed."
    );
    this.pendingRestart = true;
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
