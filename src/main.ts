import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AuthService } from "./auth/server.js";
import { PtySessionManager } from "./server/pty-session-manager.js";

const manager = new PtySessionManager();
const auth = new AuthService();
const ownerInputSchema = z.string().min(1).optional();
const sessionIdSchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
  "sessionId must start with an alphanumeric character and contain only letters, digits, '_' or '-'",
);

const server = new McpServer({
  name: "csh-local-terminal",
  version: "0.1.0",
});

server.registerTool(
  "auth_status",
  {
    description: "Return the authenticated Nostr signer pubkey and shell allowlist status.",
    inputSchema: {},
  },
  async (_args, extra) => {
    const status = await auth.authStatus(extra);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status, null, 2),
        },
      ],
      structuredContent: status,
    };
  },
);

server.registerTool(
  "auth_redeem_invite",
  {
    description: "Redeem a one-time invite token for the authenticated Nostr signer.",
    inputSchema: {
      inviteToken: z.string().min(1),
    },
  },
  async ({ inviteToken }, extra) => {
    const status = await auth.redeemInvite(inviteToken, extra);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...status,
              redeemed: true,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        ...status,
        redeemed: true,
      },
    };
  },
);

server.registerTool(
  "session_open",
  {
    description: "Open a new native PTY-backed shell session.",
    inputSchema: {
      sessionId: sessionIdSchema.optional(),
      command: z.string().optional(),
      cwd: z.string().optional(),
      cols: z.number().int().positive().optional(),
      rows: z.number().int().positive().optional(),
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, command, cwd, cols, rows, ownerId }, extra) => {
    const session = await manager.openSession({
      sessionId,
      command,
      cwd,
      cols,
      rows,
      ownerId: await auth.resolveShellActorId(ownerId, extra),
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
    description: "Write terminal input bytes or text to an existing shell session.",
    inputSchema: {
      sessionId: sessionIdSchema,
      input: z.string().optional(),
      inputBase64: z.string().optional(),
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, input, inputBase64, ownerId }, extra) => {
    if (input === undefined && inputBase64 === undefined) {
      throw new Error("session_write requires input or inputBase64");
    }

    const session = await manager.writeToSession(
      sessionId,
      await auth.resolveShellActorId(ownerId, extra),
      input,
      inputBase64,
    );
    const acceptedBytes =
      inputBase64 !== undefined
        ? Buffer.from(inputBase64, "base64").length
        : Buffer.byteLength(input ?? "", "utf8");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              sessionId: session.sessionId,
              acceptedBytes,
              lastActivityAt: session.lastActivityAt,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        sessionId: session.sessionId,
        acceptedBytes,
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
      sessionId: sessionIdSchema,
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
      await auth.resolveShellActorId(ownerId, extra),
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
      sessionId: sessionIdSchema,
      signal: z.enum(["SIGINT", "SIGTERM", "SIGHUP"]),
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, signal, ownerId }, extra) => {
    const session = await manager.signalSession(
      sessionId,
      signal,
      await auth.resolveShellActorId(ownerId, extra),
    );

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
      sessionId: sessionIdSchema,
      cursor: z.number().int().min(0).optional(),
      keepAlive: z.boolean().optional(),
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, cursor, keepAlive, ownerId }, extra) => {
    const result = await manager.pollSession(
      sessionId,
      await auth.resolveShellActorId(ownerId, extra),
      cursor,
      keepAlive ?? false,
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
              snapshotBase64: result.snapshotBase64 ?? null,
              delta: result.delta ?? null,
              deltaBase64: result.deltaBase64 ?? null,
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
        snapshotBase64: result.snapshotBase64 ?? null,
        delta: result.delta ?? null,
        deltaBase64: result.deltaBase64 ?? null,
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
    description: "Close a shell session and its backing PTY runtime.",
    inputSchema: {
      sessionId: sessionIdSchema,
      ownerId: ownerInputSchema,
    },
  },
  async ({ sessionId, ownerId }, extra) => {
    const session = await manager.closeSession(sessionId, await auth.resolveShellActorId(ownerId, extra));

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
