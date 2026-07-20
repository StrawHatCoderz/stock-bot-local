import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LoginIdentity } from "../types.js";
import { MCP_HOST, getAllowedToolsForRole, buildSystemPrompt } from "../ai-client.js";
import { MessageQueue } from "./message-queue.js";

export class AgentSession {
  private queue = new MessageQueue();
  private outputStream: AsyncIterable<any> | null = null;

  constructor(identity?: LoginIdentity) {
    this.outputStream = query({
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
          "admin-mcp": {
            type: "sse",
            url: `http://${MCP_HOST}/admin`,
            headers: {
              ...(identity ? { "x-session-token": identity.token } : {})
            },
          },
          "transfer-mcp": {
            type: "sse",
            url: `http://${MCP_HOST}/transfer`,
            headers: {
              ...(identity ? { "x-session-token": identity.token } : {})
            },
          },
        },
      },
    });
  }

  sendMessage(content: string) {
    this.queue.push(content);
  }

  async *getOutputStream() {
    for await (const value of this.outputStream!) {
      yield value;
    }
  }

  close() {
    this.queue.close();
  }
}
