import type { Server } from "http";
import { WebSocketServer } from "ws";
import type { WSClient, IncomingWSMessage } from "./types.js";
import { chatStore } from "./models/chat-store.js";
import { sessions, getOrCreateSession } from "./session-registry.js";

export const createWsServer = (server: Server) => {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WSClient) => {
    console.log("WebSocket client connected");
    ws.isAlive = true;

    ws.send(JSON.stringify({ type: "connected", message: "Connected to chat server" }));

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      try {
        const message: IncomingWSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case "subscribe": {
            const session = getOrCreateSession(message.chatId);
            session.subscribe(ws);
            console.log(`Client subscribed to chat ${message.chatId}`);

            const messages = chatStore.getMessages(message.chatId);
            ws.send(JSON.stringify({
              type: "history",
              messages,
              chatId: message.chatId,
            }));
            break;
          }

          case "chat": {
            const session = getOrCreateSession(message.chatId);
            session.subscribe(ws);
            session.sendMessage(message.content);
            break;
          }

          default:
            console.warn("Unknown message type:", (message as any).type);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        ws.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      for (const session of sessions.values()) {
        session.unsubscribe(ws);
      }
    });
  });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WSClient;
      if (!client.isAlive) {
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  return wss;
};
