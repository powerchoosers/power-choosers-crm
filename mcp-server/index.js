const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");

// Use absolute path to the log file relative to this script
const LOG_FILE_PATH = path.join(__dirname, "../.cursor/debug.log");

// 1. Initialize the Server
const server = new Server(
  {
    name: "crm-debugger",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 2. Define Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_frontend_logs",
        description: "Retrieves the latest logs from the frontend JS",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of lines to return", default: 20 }
          },
        },
      },
      {
        name: "clear_logs",
        description: "Clears the debug log file",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ],
  };
});

// 3. Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_frontend_logs") {
    try {
      if (!fs.existsSync(LOG_FILE_PATH)) {
        return { content: [{ type: "text", text: "No logs found yet. The file .cursor/debug.log does not exist." }] };
      }
      const content = fs.readFileSync(LOG_FILE_PATH, "utf8");
      const lines = content.trim().split("\n");
      const limit = args.limit || 20;
      const latestLines = lines.slice(-limit).join("\n");
      
      return {
        content: [{ type: "text", text: latestLines || "Log file is empty." }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error reading logs: ${err.message}` }],
        isError: true,
      };
    }
  }

  if (name === "clear_logs") {
    try {
      fs.writeFileSync(LOG_FILE_PATH, "");
      return {
        content: [{ type: "text", text: "Logs cleared successfully." }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error clearing logs: ${err.message}` }],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

// 4. Start the Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CRM Debugger MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
