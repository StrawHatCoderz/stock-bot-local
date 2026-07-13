import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import type { LoginIdentity } from "./types.js";
import { chatStore } from "./chat-store.js";
import { sessions } from "./session-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STOCK_API_BASE_URL = process.env.STOCK_API_BASE_URL || "http://localhost:8080";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve static files from client directory
  app.use("/client", express.static(path.join(__dirname, "../../client")));

  // Serve index.html at root
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../../client/index.html"));
  });

  // REST API: Login
  //
  // Calls the real Auth service directly (POST /api/login, then GET /api/me)
  // rather than going through the LLM — login is deterministic, not a
  // reasoning task. The resulting identity is handed back to the client,
  // which passes it along when creating a chat; from there it's baked into
  // that chat's agent session (see session.ts, ai-client.ts) so the agent
  // never needs to call authenticate_user/get_user_details itself.
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    try {
      const loginRes = await fetch(`${STOCK_API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const loginBody: any = await loginRes.json().catch(() => ({}));

      if (!loginRes.ok || !loginBody.token) {
        return res.status(401).json({
          error: loginBody.message || "Invalid username or password.",
          errorCode: loginBody.errorCode,
        });
      }

      const meRes = await fetch(`${STOCK_API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      const meBody: any = await meRes.json().catch(() => ({}));

      if (!meRes.ok || meBody.authorized !== true) {
        return res.status(403).json({
          error: meBody.message || "Not authorized as a store manager.",
          errorCode: meBody.errorCode,
        });
      }

      const identity: LoginIdentity = {
        token: loginBody.token,
        employeeId: meBody.employee_id,
        employeeNumber: meBody.employee_number,
        name: meBody.name,
        email: meBody.email,
        storeId: meBody.assignedTo,
      };
      res.json(identity);
    } catch (error) {
      console.error("Login failed:", error);
      res.status(502).json({ error: `Could not reach the Auth service at ${STOCK_API_BASE_URL}.` });
    }
  });

  // REST API: Get all chats
  app.get("/api/chats", (req, res) => {
    const chats = chatStore.getAllChats();
    res.json(chats);
  });

  // REST API: Create new chat
  app.post("/api/chats", (req, res) => {
    const chat = chatStore.createChat(req.body?.title, req.body?.identity);
    res.status(201).json(chat);
  });

  // REST API: Get single chat
  app.get("/api/chats/:id", (req, res) => {
    const chat = chatStore.getChat(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    res.json(chat);
  });

  // REST API: Delete chat
  app.delete("/api/chats/:id", (req, res) => {
    const deleted = chatStore.deleteChat(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Chat not found" });
    }
    const session = sessions.get(req.params.id);
    if (session) {
      session.close();
      sessions.delete(req.params.id);
    }
    res.json({ success: true });
  });

  // REST API: Get chat messages
  app.get("/api/chats/:id/messages", (req, res) => {
    const messages = chatStore.getMessages(req.params.id);
    res.json(messages);
  });

  return app;
}
