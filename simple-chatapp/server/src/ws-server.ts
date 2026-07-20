import type { Server } from "http";
import { WebSocketServer } from "ws";
import type { WSClient, IncomingWSMessage } from "./types.js";
import { chatStore } from "./models/chat-store.js";
import { sessions, getOrCreateSession } from "./session-registry.js";

const HEARTBEAT_INTERVAL_MS = 30000;

const handleSubscribe = (ws: WSClient, message: IncomingWSMessage & { type: "subscribe" }) => {
  const session = getOrCreateSession(message.chatId);
  session.subscribe(ws);
  console.log(`Client subscribed to chat ${message.chatId}`);

  const messages = chatStore.getMessages(message.chatId);
  ws.send(JSON.stringify({
    type: "history",
    messages,
    chatId: message.chatId,
  }));
};

const handleChat = (ws: WSClient, message: IncomingWSMessage & { type: "chat" }) => {
  const session = getOrCreateSession(message.chatId);
  session.subscribe(ws);
  session.sendMessage(message.content);
};

const onMessage = (ws: WSClient, data: unknown) => {
  try {
    const message: IncomingWSMessage = JSON.parse((data as { toString(): string }).toString());

    switch (message.type) {
      case "subscribe":
        handleSubscribe(ws, message);
        break;

      case "chat":
        handleChat(ws, message);
        break;

      case "confirm_action": {
        const session = sessions.get(message.chatId);
        session?.resolveConfirmation(true);
        break;
      }

      case "cancel_action": {
        const session = sessions.get(message.chatId);
        session?.resolveConfirmation(false);
        break;
      }

      default:
        console.warn("Unknown message type:", (message as any).type);
    }
  } catch (error) {
    console.error("Error handling WebSocket message:", error);
    ws.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
  }
};

const onPong = (ws: WSClient) => {
  ws.isAlive = true;
};

const onClose = (ws: WSClient) => {
  console.log("WebSocket client disconnected");
  for (const session of sessions.values()) {
    session.unsubscribe(ws);
  }
};

const onConnection = (ws: WSClient) => {
  console.log("WebSocket client connected");
  ws.isAlive = true;

  ws.send(JSON.stringify({ type: "connected", message: "Connected to chat server" }));

  ws.on("pong", () => onPong(ws));
  ws.on("message", (data) => onMessage(ws, data));
  ws.on("close", () => onClose(ws));
};

const startHeartbeat = (wss: WebSocketServer) =>
  setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WSClient;
      if (!client.isAlive) {
        client.terminate();
        return;
      }

      client.isAlive = false;
      client.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

export const createWsServer = (server: Server) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", onConnection);

  const heartbeat = startHeartbeat(wss);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
};
