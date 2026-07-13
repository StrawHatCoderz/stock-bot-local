import type { WebSocket } from "ws";

// WebSocket client with session data
export interface WSClient extends WebSocket {
  sessionId?: string;
  isAlive?: boolean;
}

// Identity established by POST /api/auth/login (a direct call to the real
// Auth service, not something the agent negotiates). Baked into the agent's
// system prompt so it never needs to call authenticate_user/get_user_details
// itself.
export interface LoginIdentity {
  token: string;
  employeeId: string;
  employeeNumber: string;
  name: string;
  email: string;
  storeId: string;
  role: string;
}

// Chat stored in memory
export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  identity?: LoginIdentity;
}

// Message stored in memory
export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// WebSocket incoming messages
export interface WSChatMessage {
  type: "chat";
  content: string;
  chatId: string;
}

export interface WSSubscribeMessage {
  type: "subscribe";
  chatId: string;
}

export type IncomingWSMessage = WSChatMessage | WSSubscribeMessage;
