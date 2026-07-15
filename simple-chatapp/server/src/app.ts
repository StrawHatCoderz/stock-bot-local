import express from "express";
import cors from "cors";
import path from "path";
import type { LoginIdentity } from "./types.js";
import { chatStore } from "./models/chat-store.js";
import { sessions } from "./session-registry.js";
import { apiGet, apiPost } from "./utils/apiUtils.js";

const STOCK_API_BASE_URL = process.env.STOCK_API_BASE_URL || "http://localhost:8080";

export const createApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const staticDir = path.join(process.cwd(), "public");
  app.use(express.static(staticDir));

  app.get("/", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    try {
      const loginBody: any = await apiPost(`${STOCK_API_BASE_URL}/api/login`, {
        username,
        password,
      }).catch(() => ({}));

      if (!loginBody.token) {
        return res.status(401).json({
          error: loginBody.message || "Invalid username or password.",
          errorCode: loginBody.errorCode,
        });
      }

      const meBody: any = await apiGet(`${STOCK_API_BASE_URL}/api/me`, {
        Authorization: `Bearer ${loginBody.token}`,
      }).catch(() => ({}));

      if (!meBody.authorized) {
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
        role: meBody.role,
      };
      res.json(identity);
    } catch (error) {
      console.error("Login failed:", error);
      res.status(502).json({ error: `Could not reach the Auth service at ${STOCK_API_BASE_URL}.` });
    }
  });

  app.get("/api/chats", (req, res) => {
    const chats = chatStore.getAllChats();
    res.json(chats);
  });

  app.post("/api/chats", (req, res) => {
    const chat = chatStore.createChat(req.body?.title, req.body?.identity);
    res.status(201).json(chat);
  });

  app.get("/api/chats/:id", (req, res) => {
    const chat = chatStore.getChat(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    res.json(chat);
  });

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


  app.get("/api/chats/:id/messages", (req, res) => {
    const messages = chatStore.getMessages(req.params.id);
    res.json(messages);
  });

  return app;
};