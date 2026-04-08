#!/usr/bin/env bun
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Args = {
  port: number;
  logFile: string;
  errorMessage: string;
};

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArgs(): Args {
  const port = Number(getArg("--port") ?? process.env.PORT ?? "8765");
  const logFile = resolve(
    getArg("--log") ?? process.env.CAPTURE_LOG_FILE ?? "monitor/request-shape/artifacts/capture-log.jsonl",
  );
  const errorMessage = getArg("--error-message") ?? process.env.CAPTURE_ERROR_MESSAGE ?? "capture";
  return { port, logFile, errorMessage };
}

const args = parseArgs();
mkdirSync(dirname(args.logFile), { recursive: true });
writeFileSync(args.logFile, "");

function logRequest(request: Request, bodyText: string) {
  const headers = Object.fromEntries(Array.from(request.headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
  appendFileSync(
    args.logFile,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: new URL(request.url).pathname + new URL(request.url).search,
      headers,
      body: bodyText,
    })}\n`,
    "utf8",
  );
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: args.port,
  async fetch(request) {
    const url = new URL(request.url);
    const bodyText = request.method === "POST" ? await request.text() : "";
    logRequest(request, bodyText);

    if (request.method === "GET" && url.pathname.endsWith("/api/oauth/claude_cli/client_data")) {
      return Response.json({ client_data: {} });
    }

    if (request.method === "POST") {
      return Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: args.errorMessage,
          },
        },
        { status: 400 },
      );
    }

    return Response.json({ ok: true });
  },
});

console.log(`capture server listening on http://127.0.0.1:${server.port}`);
console.log(`logging to ${args.logFile}`);

await new Promise<void>((resolvePromise) => {
  const shutdown = () => {
    server.stop(true);
    resolvePromise();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
