import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TmuxSessionManager } from "./server/tmux-session-manager.js";

const manager = new TmuxSessionManager();
const ownerInputSchema = z.string().min(1).optional();

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
      ownerId: ownerInputSchema,
    },
  },
  async ({ command, cwd, cols, rows, ownerId }, extra) => {
    const session = await manager.openSession({
      command,
      cwd,
      cols,
      rows,
      ownerId: resolveActorId(ownerId, extra),
    });

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
    description: "Write terminal input text to an existing shell session.",
    inputSchema: {
      sessionId: z.string(),
      input: z.string(),
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, input, ownerId }, extra) => {
    const session = await manager.writeToSession(sessionId, input, resolveActorId(ownerId, extra));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              acceptedChars: input.length,
              lastActivityAt: session.lastActivityAt,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        acceptedChars: input.length,
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
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, cols, rows, ownerId }, extra) => {
    const session = await manager.resizeSession(
      sessionId,
      cols,
      rows,
      resolveActorId(ownerId, extra),
    );

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
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, signal, ownerId }, extra) => {
    const session = await manager.signalSession(sessionId, signal, resolveActorId(ownerId, extra));

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
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, cursor, ownerId }, extra) => {
    const result = await manager.pollSession(
      sessionId,
      resolveActorId(ownerId, extra),
      cursor,
    );

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
              closedAt: result.session.closedAt ?? null,
              exitStatus: result.session.exitStatus ?? null,
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
        closedAt: result.session.closedAt ?? null,
        exitStatus: result.session.exitStatus ?? null,
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
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, ownerId }, extra) => {
    const session = await manager.closeSession(sessionId, resolveActorId(ownerId, extra));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              closedAt: session.closedAt,
              exitStatus: session.exitStatus ?? null,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        closedAt: session.closedAt ?? null,
        exitStatus: session.exitStatus ?? null,
      },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

function resolveActorId(
  requestedOwnerId: string | undefined,
  extra: unknown,
): string {
  const forcedOwnerId = process.env.CSH_FORCED_OWNER_ID?.trim() || undefined;
  const metadataOwnerId =
    typeof extra === "object" &&
    extra !== null &&
    "_meta" in extra &&
    typeof extra._meta === "object" &&
    extra._meta !== null &&
    "clientPubkey" in extra._meta &&
    typeof extra._meta.clientPubkey === "string"
      ? extra._meta.clientPubkey
      : undefined;

  if (forcedOwnerId) {
    if (requestedOwnerId && requestedOwnerId !== forcedOwnerId) {
      throw new Error("ownerId does not match the enforced server-side identity");
    }

    return forcedOwnerId;
  }

  if (metadataOwnerId && requestedOwnerId && requestedOwnerId !== metadataOwnerId) {
    throw new Error("ownerId does not match the authenticated client identity");
  }

  if (metadataOwnerId) {
    return metadataOwnerId;
  }

  if (process.env.CSH_ALLOW_UNAUTHENTICATED_OWNER === "1") {
    return requestedOwnerId ?? "local";
  }

  throw new Error("Authenticated client identity is required for session access");
}
