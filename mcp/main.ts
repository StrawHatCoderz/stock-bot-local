import { createApp } from "./src/app.js";

const PORT = process.env.PORT || 3000;

const main = () => {
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`MCP Servers running on http://localhost:${PORT}`);
    console.log(`- Validation MCP: http://localhost:${PORT}/validation`);
    console.log(`- Stock MCP: http://localhost:${PORT}/stock`);
    console.log(`- Admin MCP: http://localhost:${PORT}/admin`);
    console.log(`- Transfer MCP: http://localhost:${PORT}/transfer`);
  });
};

main();
