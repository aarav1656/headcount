import { createServer } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import attest from "./api/attest";
import health from "./api/health";

const routes: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  "/api/attest": attest,
  "/api/health": health,
};

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const handler = routes[(req.url ?? "").split("?")[0]];
  if (!handler) return res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not_found"}');

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) return res.writeHead(413).end();
  }
  let body: unknown = undefined;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    return res.writeHead(400, { "content-type": "application/json" }).end('{"error":"bad_json"}');
  }

  const vreq = Object.assign(req, { body, query: {}, cookies: {} }) as unknown as VercelRequest;
  const vres = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vres;
    },
    json(payload: unknown) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
      return vres;
    },
  }) as unknown as VercelResponse;
  await handler(vreq, vres);
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
