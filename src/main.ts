import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TmuxSessionManager } from "./server/tmux-session-manager.js";

const manager = new TmuxSessionManager();

const server = new McpServer({
  name: "csh-local-terminal",
  version: "0.1.0",
});

server.registerTool(
  "session_open",
  {
    description: "Open a new tmux-backed shell session.",
    inputSchema: {
      command: z.string().optional(),
      cwd: z.string().optional(),
      cols: z.number().int().positive().optional(),
      rows: z.number().int().positive().optional(),
    },
  },
  async ({ command, cwd, cols, rows }) => {
    const session = await manager.openSession({ command, cwd, cols, rows });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              cursor: session.revision,
              cols: session.cols,
              rows: session.rows,
              ownerId: session.ownerId,
              command: session.command,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        cursor: session.revision,
        cols: session.cols,
        rows: session.rows,
        ownerId: session.ownerId,
        command: session.command,
      },
    };
  },
);

server.registerTool(
  "session_write",
  {
    description: "Write raw input bytes to an existing shell session.",
    inputSchema: {
      sessionId: z.string(),
      input: z.string(),
    },
  },
  async ({ sessionId, input }) => {
    const session = await manager.writeToSession(sessionId, input);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              acceptedBytes: input.length,
              lastActivityAt: session.lastActivityAt,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        acceptedBytes: input.length,
        lastActivityAt: session.lastActivityAt,
      },
    };
  },
);

server.registerTool(
  "session_resize",
  {
    description: "Resize the shell session window.",
    inputSchema: {
      sessionId: z.string(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    },
  },
  async ({ sessionId, cols, rows }) => {
    const session = await manager.resizeSession(sessionId, cols, rows);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              cols: session.cols,
              rows: session.rows,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        cols: session.cols,
        rows: session.rows,
      },
    };
  },
);

server.registerTool(
  "session_signal",
  {
    description: "Send an operating-system signal to the shell session.",
    inputSchema: {
      sessionId: z.string(),
      signal: z.enum(["SIGINT", "SIGTERM", "SIGHUP"]),
    },
  },
  async ({ sessionId, signal }) => {
    const session = await manager.signalSession(sessionId, signal);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              signal,
              lastActivityAt: session.lastActivityAt,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        signal,
        lastActivityAt: session.lastActivityAt,
      },
    };
  },
);

server.registerTool(
  "session_poll",
  {
    description: "Poll the current session snapshot. Returns a new snapshot when the revision changed.",
    inputSchema: {
      sessionId: z.string(),
      cursor: z.number().int().min(0).optional(),
    },
  },
  async ({ sessionId, cursor }) => {
    const result = await manager.pollSession(sessionId, cursor);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: result.session.sessionId,
              changed: result.changed,
              cursor: result.revision,
              snapshot: result.snapshot ?? null,
              cols: result.session.cols,
              rows: result.session.rows,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: result.session.sessionId,
        changed: result.changed,
        cursor: result.revision,
        snapshot: result.snapshot ?? null,
        cols: result.session.cols,
        rows: result.session.rows,
      },
    };
  },
);

server.registerTool(
  "session_close",
  {
    description: "Close a shell session and its backing tmux runtime.",
    inputSchema: {
      sessionId: z.string(),
    },
  },
  async ({ sessionId }) => {
    const session = await manager.closeSession(sessionId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              closedAt: session.closedAt,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        closedAt: session.closedAt ?? null,
      },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
