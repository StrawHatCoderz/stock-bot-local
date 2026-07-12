import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./src/app.js";
import { createWsServer } from "./src/ws-server.js";

const PORT = process.env.PORT || 3001;

const main = () => {
  const app = createApp();
  const server = createServer(app);
  createWsServer(server);

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket endpoint available at ws://localhost:${PORT}/ws`);
    console.log(`Visit http://localhost:${PORT} to view the chat interface`);
  });
};

main();
