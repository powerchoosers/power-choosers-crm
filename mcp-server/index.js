const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Paths relative to this script (mcp-server/ is inside project root)
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOG_FILE_PATH = path.join(PROJECT_ROOT, ".cursor", "debug.log");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "supabase", "migrations");

/**
 * Run a Supabase CLI command from the project root.
 * @param {string[]} args - Arguments for "supabase" (e.g. ["migration", "list"])
 * @param {{ env?: object }} options - Optional env overrides
 * @returns {{ success: boolean, output: string, error?: string }}
 */
function runSupabase(args, options = {}) {
  const cmd = `npx supabase ${args.join(" ")}`;
  try {
    const output = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...options.env },
    });
    return { success: true, output: output || "(no output)" };
  } catch (err) {
    const stdout = err.stdout != null ? String(err.stdout) : "";
    const stderr = err.stderr != null ? String(err.stderr) : "";
    return {
      success: false,
      output: stdout || stderr || err.message,
      error: stderr || err.message,
    };
  }
}

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
      },
      {
        name: "supabase_migration_list",
        description: "List Supabase migrations: shows which are applied and which are pending on the linked remote project. Run from project root; requires project to be linked (npx supabase link).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "supabase_db_push",
        description: "Apply pending Supabase migrations to the linked remote database. Use dry_run=true to only print what would be applied without applying. Requires Supabase project to be linked and CLI authenticated.",
        inputSchema: {
          type: "object",
          properties: {
            dry_run: {
              type: "boolean",
              description: "If true, only show what would be applied (do not apply)",
              default: false,
            },
          },
        },
      },
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

  if (name === "supabase_migration_list") {
    const result = runSupabase(["migration", "list"]);
    const text = result.success
      ? `Migrations list:\n${result.output}`
      : `Failed to list migrations:\n${result.output}`;
    return {
      content: [{ type: "text", text }],
      isError: !result.success,
    };
  }

  if (name === "supabase_db_push") {
    const dryRun = args && args.dry_run === true;
    const result = runSupabase(
      dryRun ? ["db", "push", "--dry-run"] : ["db", "push"]
    );
    const text = result.success
      ? (dryRun ? `Dry run result:\n${result.output}` : `Migrations applied:\n${result.output}`)
      : `Failed to push migrations:\n${result.output}`;
    return {
      content: [{ type: "text", text }],
      isError: !result.success,
    };
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
