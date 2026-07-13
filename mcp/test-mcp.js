import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  console.log("Connecting to MCP...");
  const transport = new SSEClientTransport(new URL("http://localhost:3000/validation"));
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  
  console.log("Connected!");
  const tools = await client.listTools();
  console.log("Tools:", tools);
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
