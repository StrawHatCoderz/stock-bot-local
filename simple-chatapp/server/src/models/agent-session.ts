import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LoginIdentity } from "../types.js";
import { MCP_HOST, getAllowedToolsForRole, buildSystemPrompt } from "../ai-client.js";
import { MessageQueue } from "./message-queue.js";

export class AgentSession {
  private queue = new MessageQueue();
  private outputIterator: AsyncIterator<any> | null = null;

  constructor(identity?: LoginIdentity) {
    this.outputIterator = query({
      prompt: this.queue as any,
      options: {
        maxTurns: 100,
        model: "claude-sonnet-5",
        allowedTools: getAllowedToolsForRole(identity?.role),
        systemPrompt: buildSystemPrompt(identity),
        settingSources: [],
        mcpServers: {
          "validation-mcp": {
            type: "sse",
            url: `http://${MCP_HOST}/validation`,
            headers: {
              ...(identity ? { "x-session-token": identity.token } : {})
            },
          },
          "stock-mcp": {
            type: "sse",
            url: `http://${MCP_HOST}/stock`,
            headers: {
              ...(identity ? { "x-session-token": identity.token } : {})
            },
          },
        },
      },
    })[Symbol.asyncIterator]();
  }

  sendMessage(content: string) {
    this.queue.push(content);
  }

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
