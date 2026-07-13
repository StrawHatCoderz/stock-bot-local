import { query } from "@anthropic-ai/claude-agent-sdk";
async function run() {
  const iterator = query({
    prompt: "hello",
    options: {
      mcpServers: {
        test: {
          type: "sse",
          url: "http://localhost:3000/test",
          headers: { "x-token": "123" }
        }
      }
    }
  })[Symbol.asyncIterator]();
  try {
    await iterator.next();
    console.log("Started successfully");
  } catch(e) {
    console.error("FAILED:", e.message);
  }
}
run();
