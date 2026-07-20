#!/usr/bin/env node
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createValidationMCPServer } from "./mcp-server-validation.js";
import { createStockMCPServer } from "./mcp-server-stock.js";
import { createAdminMCPServer } from "./mcp-server-admin.js";
import { createTransferMCPServer } from "./mcp-server-transfer.js";
import { sessionContext } from "./context.js";

const startServer = async () => {
  const app = express();
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });
  app.use(express.json());

  const validationTransports = new Map<string, SSEServerTransport>();
  const stockTransports = new Map<string, SSEServerTransport>();

  app.get("/validation", async (req, res) => {
    try {
      console.log("New Validation SSE connection established");
      const validationMCP = createValidationMCPServer({
        name: "validation-mcp",
        version: "0.1.0",
      });
      
      const transport = new SSEServerTransport("/validation/messages", res);
      await validationMCP.connect(transport);
      
      validationTransports.set(transport.sessionId, transport);
      
      res.on("close", () => {
        console.log(`Validation SSE connection closed: ${transport.sessionId}`);
        validationTransports.delete(transport.sessionId);
        validationMCP.close();
      });
    } catch (err) {
      console.error("Error in GET /validation:", err);
      if (!res.headersSent) res.status(500).send("Internal Server Error");
    }
  });

  app.post("/validation/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = validationTransports.get(sessionId);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    
    const context = {
      token: req.headers["x-session-token"] as string | undefined,
    };

    sessionContext.run(context, () => {
      transport.handlePostMessage(req, res, req.body).catch((e) => {
        console.error("Validation MCP Message Error:", e);
      });
    });
  });

  app.get("/stock", async (req, res) => {
    console.log("New Stock SSE connection established");
    const stockMCP = createStockMCPServer({
      name: "stock-mcp",
      version: "0.1.0",
    });
    
    const transport = new SSEServerTransport("/stock/messages", res);
    await stockMCP.connect(transport);
    
    stockTransports.set(transport.sessionId, transport);
    
    res.on("close", () => {
      console.log(`Stock SSE connection closed: ${transport.sessionId}`);
      stockTransports.delete(transport.sessionId);
      stockMCP.close();
    });
  });

  app.post("/stock/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = stockTransports.get(sessionId);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    
    const context = {
      token: req.headers["x-session-token"] as string | undefined,
    };

    sessionContext.run(context, () => {
      transport.handlePostMessage(req, res, req.body).catch((e) => {
        console.error("Stock MCP Message Error:", e);
      });
    });
  });

  const adminTransports = new Map<string, SSEServerTransport>();

  app.get("/admin", async (req, res) => {
    try {
      console.log("New Admin SSE connection established");
      const adminMCP = createAdminMCPServer({
        name: "admin-mcp",
        version: "0.1.0",
      });

      const transport = new SSEServerTransport("/admin/messages", res);
      await adminMCP.connect(transport);

      adminTransports.set(transport.sessionId, transport);

      res.on("close", () => {
        console.log(`Admin SSE connection closed: ${transport.sessionId}`);
        adminTransports.delete(transport.sessionId);
        adminMCP.close();
      });
    } catch (err) {
      console.error("Error in GET /admin:", err);
      if (!res.headersSent) res.status(500).send("Internal Server Error");
    }
  });

  app.post("/admin/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = adminTransports.get(sessionId);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }

    const context = {
      token: req.headers["x-session-token"] as string | undefined,
    };

    sessionContext.run(context, () => {
      transport.handlePostMessage(req, res, req.body).catch((e) => {
        console.error("Admin MCP Message Error:", e);
      });
    });
  });

  const transferTransports = new Map<string, SSEServerTransport>();

  app.get("/transfer", async (req, res) => {
    try {
      console.log("New Transfer SSE connection established");
      const transferMCP = createTransferMCPServer({
        name: "transfer-mcp",
        version: "0.1.0",
      });

      const transport = new SSEServerTransport("/transfer/messages", res);
      await transferMCP.connect(transport);

      transferTransports.set(transport.sessionId, transport);

      res.on("close", () => {
        console.log(`Transfer SSE connection closed: ${transport.sessionId}`);
        transferTransports.delete(transport.sessionId);
        transferMCP.close();
      });
    } catch (err) {
      console.error("Error in GET /transfer:", err);
      if (!res.headersSent) res.status(500).send("Internal Server Error");
    }
  });

  app.post("/transfer/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transferTransports.get(sessionId);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }

    const context = {
      token: req.headers["x-session-token"] as string | undefined,
    };

    sessionContext.run(context, () => {
      transport.handlePostMessage(req, res, req.body).catch((e) => {
        console.error("Transfer MCP Message Error:", e);
      });
    });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("EXPRESS GLOBAL ERROR:", err);
    res.status(500).send("Internal Server Error");
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`MCP Servers running on http://localhost:${port}`);
    console.log(`- Validation MCP: http://localhost:${port}/validation`);
    console.log(`- Stock MCP: http://localhost:${port}/stock`);
    console.log(`- Admin MCP: http://localhost:${port}/admin`);
    console.log(`- Transfer MCP: http://localhost:${port}/transfer`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
