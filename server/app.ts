import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { ZodError } from "zod";
import {
  credentialsSchema,
  savedInputSchema,
  jobInputSchema,
} from "../src/model/backend";
import type { Database } from "./database";
import { Jobs, jobFromRow } from "./jobs";
import {
  checkOrigin,
  cookieToken,
  hashPassword,
  HttpError,
  RateLimiter,
  secretToken,
  sessionCookie,
  tokenHash,
  verifyPassword,
} from "./security";
import {
  importOsm,
  importDemand,
  osmInputSchema,
  demandInputSchema,
} from "./imports";
import { TomTom } from "./tomtom";

export interface AppOptions {
  db: Database;
  origin: string;
  production?: boolean;
  allowRegistration?: boolean;
  staticDirectory?: string;
  jobTimeoutMs?: number;
  requestLimit?: number;
  authLimit?: number;
  tomtom?: TomTom;
}
const identifier =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
function json(res: ServerResponse, code: number, value: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      req.headers["content-type"] ?? "",
    )
  )
    throw new HttpError(415, "Use application/json");
  if (Number(req.headers["content-length"] ?? 0) > 3_000_000)
    throw new HttpError(413, "Request exceeds 3 MB");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > 3_000_000) throw new HttpError(413, "Request exceeds 3 MB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export async function createApp(options: AppOptions) {
  const { db } = options,
    jobs = new Jobs(db, options.jobTimeoutMs);
  const tomtom = options.tomtom ?? new TomTom();
  const requests = new RateLimiter(options.requestLimit ?? 30000, 60000),
    auth = new RateLimiter(options.authLimit ?? 1000, 15 * 60000),
    authAccount = new RateLimiter(10, 15 * 60000),
    userRequests = new RateLimiter(600, 60000);
  let activeAuthentications = 0;
  let storageWrites: Promise<unknown> = Promise.resolve();
  async function serializedStorage<T>(work: () => Promise<T>): Promise<T> {
    const operation = storageWrites.then(work);
    storageWrites = operation.catch(() => undefined);
    return operation;
  }
  const dummyPassword = await hashPassword(secretToken());
  const cleanup = setInterval(() => {
    void db
      .query("DELETE FROM flux_sessions WHERE expires_at<$1", [
        new Date().toISOString(),
      ])
      .catch(() => undefined);
  }, 3600000);
  cleanup.unref();
  await jobs.start();
  async function session(req: IncomingMessage) {
    const token = cookieToken(req);
    if (!token)
      throw new HttpError(401, "Sign in to use server storage and simulations");
    const [row] = await db.query(
      "SELECT u.id,u.email,s.csrf FROM flux_sessions s JOIN flux_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2",
      [tokenHash(token), new Date().toISOString()],
    );
    if (!row) throw new HttpError(401, "Session expired; sign in again");
    return {
      user: { id: String(row.id), email: String(row.email) },
      csrf: String(row.csrf),
      token,
    };
  }
  async function signedIn(req: IncomingMessage) {
    const current = await session(req);
    userRequests.check(current.user.id);
    if (
      !["GET", "HEAD"].includes(req.method ?? "") &&
      req.headers["x-flux-csrf"] !== current.csrf
    )
      throw new HttpError(403, "CSRF token is missing or invalid");
    return current;
  }
  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    checkOrigin(req, options.origin);
    const method = req.method ?? "GET",
      ip = req.socket.remoteAddress ?? "unknown";
    requests.check(ip);
    if (method === "GET" && path === "/api/health") {
      await db.query("SELECT version FROM flux_migrations WHERE version=1");
      return json(res, 200, {
        status: "ok",
        apiVersion: 1,
        registration: options.allowRegistration ?? false,
      });
    }
    if (method === "GET" && path === "/api/session") {
      try {
        const s = await session(req);
        return json(res, 200, { user: s.user, csrf: s.csrf });
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          return json(res, 200, { user: null });
        throw error;
      }
    }
    if (
      method === "POST" &&
      ["/api/auth/register", "/api/auth/login"].includes(path)
    ) {
      auth.check(ip);
      const input = credentialsSchema.parse(await body(req));
      authAccount.check(input.email);
      if (activeAuthentications >= 128)
        throw new HttpError(429, "Sign-in service is busy; retry shortly");
      activeAuthentications++;
      try {
        let [row] = await db.query(
          "SELECT id,email,password_hash FROM flux_users WHERE email=$1",
          [input.email],
        );
        if (path.endsWith("/register")) {
          if (!options.allowRegistration)
            throw new HttpError(403, "Account registration is disabled");
          if (row)
            throw new HttpError(
              409,
              "An account cannot be created with those details",
            );
          const [count] = await db.query(
            "SELECT COUNT(*) AS total FROM flux_users",
          );
          if (Number(count.total) >= 10000)
            throw new HttpError(429, "Account capacity reached");
          const hashed = await hashPassword(input.password);
          try {
            [row] = await db.query(
              "INSERT INTO flux_users(id,email,password_hash,created_at) VALUES($1,$2,$3,$4) RETURNING id,email",
              [randomUUID(), input.email, hashed, new Date().toISOString()],
            );
          } catch (error) {
            if ((error as { code?: string }).code === "23505")
              throw new HttpError(
                409,
                "An account cannot be created with those details",
              );
            throw error;
          }
        } else if (
          !(await verifyPassword(
            input.password,
            row ? String(row.password_hash) : dummyPassword,
          )) ||
          !row
        )
          throw new HttpError(401, "Email or password is incorrect");
        if (
          path.endsWith("/login") &&
          String(row.password_hash).split(":").length === 3
        )
          await db.query("UPDATE flux_users SET password_hash=$2 WHERE id=$1", [
            row.id,
            await hashPassword(input.password),
          ]);
        const token = secretToken(),
          csrf = secretToken();
        // Rotate an existing session and bound retained sessions per account.
        const previous = cookieToken(req);
        if (previous)
          await db.query("DELETE FROM flux_sessions WHERE token_hash=$1", [
            tokenHash(previous),
          ]);
        await db.query(
          "DELETE FROM flux_sessions WHERE user_id=$1 AND expires_at<$2",
          [row.id, new Date().toISOString()],
        );
        const [count] = await db.query(
          "SELECT COUNT(*) AS total FROM flux_sessions WHERE user_id=$1",
          [row.id],
        );
        if (Number(count.total) >= 10)
          await db.query(
            "DELETE FROM flux_sessions WHERE token_hash=(SELECT token_hash FROM flux_sessions WHERE user_id=$1 ORDER BY expires_at LIMIT 1)",
            [row.id],
          );
        await db.query(
          "INSERT INTO flux_sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,$4)",
          [
            tokenHash(token),
            row.id,
            csrf,
            new Date(Date.now() + 86400000).toISOString(),
          ],
        );
        res.setHeader(
          "Set-Cookie",
          sessionCookie(token, options.production ?? false),
        );
        return json(res, path.endsWith("/register") ? 201 : 200, {
          user: { id: row.id, email: row.email },
          csrf,
        });
      } finally {
        activeAuthentications--;
      }
    }
    const current = await signedIn(req),
      owner = current.user.id;
    if (method === "GET" && path === "/api/providers")
      return json(res, 200, {
        tomtom: { configured: tomtom.enabled, transient: true },
      });
    if (method === "POST" && path === "/api/traffic/tomtom")
      return json(res, 200, await tomtom.flow(owner, await body(req)));
    if (method === "POST" && path === "/api/auth/logout") {
      await db.query("DELETE FROM flux_sessions WHERE token_hash=$1", [
        tokenHash(current.token),
      ]);
      res.setHeader(
        "Set-Cookie",
        sessionCookie("", options.production ?? false, true),
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/scenarios" && method === "GET") {
      const rows = await db.query(
        "SELECT id,document,updated_at FROM flux_scenarios WHERE owner_id=$1 ORDER BY updated_at DESC,id LIMIT 100",
        [owner],
      );
      return json(
        res,
        200,
        rows.map((r) => ({
          id: r.id,
          ...JSON.parse(String(r.document)),
          updatedAt: r.updated_at,
        })),
      );
    }
    if (path === "/api/scenarios" && method === "POST") {
      const input = savedInputSchema.parse(await body(req)),
        id = randomUUID(),
        date = new Date().toISOString();
      return serializedStorage(async () => {
        const rows = await db.query(
          "INSERT INTO flux_scenarios(id,owner_id,document,updated_at) SELECT $1,$2,$3,$4 WHERE (SELECT COUNT(*) FROM flux_scenarios WHERE owner_id=$2)<100 RETURNING id",
          [id, owner, JSON.stringify(input), date],
        );
        if (!rows.length)
          throw new HttpError(
            409,
            "Server save limit reached; delete an old scenario",
          );
        return json(res, 201, { id, ...input, updatedAt: date });
      });
    }
    const match =
      /^\/api\/(scenarios|jobs|datasets)\/([^/]+)(?:\/(cancel|raw))?$/.exec(
        path,
      );
    if (match && !identifier.test(match[2]))
      throw new HttpError(404, "Record not found");
    if (match?.[1] === "scenarios" && !match[3]) {
      const id = match[2];
      if (method === "PUT") {
        const input = savedInputSchema.parse(await body(req)),
          date = new Date().toISOString();
        const rows = await db.query(
          "UPDATE flux_scenarios SET document=$3,updated_at=$4 WHERE id=$1 AND owner_id=$2 RETURNING id",
          [id, owner, JSON.stringify(input), date],
        );
        if (!rows.length) throw new HttpError(404, "Scenario not found");
        return json(res, 200, { id, ...input, updatedAt: date });
      }
      if (method === "GET" || method === "DELETE") {
        const [row] = await db.query(
          method === "GET"
            ? "SELECT id,document,updated_at FROM flux_scenarios WHERE id=$1 AND owner_id=$2"
            : "DELETE FROM flux_scenarios WHERE id=$1 AND owner_id=$2 RETURNING id",
          [id, owner],
        );
        if (!row) throw new HttpError(404, "Scenario not found");
        return json(
          res,
          200,
          method === "GET"
            ? {
                id: row.id,
                ...JSON.parse(String(row.document)),
                updatedAt: row.updated_at,
              }
            : { ok: true },
        );
      }
    }
    if (path === "/api/jobs" && method === "POST")
      return json(
        res,
        202,
        await jobs.submit(owner, jobInputSchema.parse(await body(req))),
      );
    if (path === "/api/jobs" && method === "GET") {
      const rows = await db.query(
        "SELECT id,name,status,progress,error,created_at,finished_at FROM flux_jobs WHERE owner_id=$1 ORDER BY created_at DESC,id LIMIT 200",
        [owner],
      );
      return json(
        res,
        200,
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          progress: r.progress,
          error: r.error,
          createdAt: r.created_at,
          finishedAt: r.finished_at,
        })),
      );
    }
    if (match?.[1] === "jobs") {
      if (method === "POST" && match[3] === "cancel")
        return json(res, 200, await jobs.cancel(match[2], owner));
      if (method === "GET" && !match[3]) {
        const [row] = await db.query(
          "SELECT * FROM flux_jobs WHERE id=$1 AND owner_id=$2",
          [match[2], owner],
        );
        if (!row) throw new HttpError(404, "Job not found");
        return json(res, 200, jobFromRow(row));
      }
      if (method === "DELETE" && !match[3]) {
        const rows = await db.query(
          "DELETE FROM flux_jobs WHERE id=$1 AND owner_id=$2 AND status NOT IN ('queued','running') RETURNING id",
          [match[2], owner],
        );
        if (!rows.length)
          throw new HttpError(
            409,
            "No finished job to delete; cancel active jobs first",
          );
        return json(res, 200, { ok: true });
      }
    }
    if (
      method === "POST" &&
      ["/api/import/osm", "/api/import/demand"].includes(path)
    ) {
      const raw = await body(req),
        isOsm = path.endsWith("/osm");
      const text = isOsm
        ? osmInputSchema.parse(raw).text
        : demandInputSchema.parse(raw).text;
      return serializedStorage(async () => {
        const [count] = await db.query(
          "SELECT COUNT(*) AS total FROM flux_datasets WHERE owner_id=$1",
          [owner],
        );
        if (Number(count.total) >= 20)
          throw new HttpError(
            409,
            "Dataset limit reached; delete an old import",
          );
        let imported;
        try {
          imported = isOsm ? importOsm(raw) : importDemand(raw);
        } catch (error) {
          if (error instanceof ZodError) throw error;
          throw new HttpError(
            400,
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Invalid data file",
          );
        }
        const id = randomUUID(),
          createdAt = new Date().toISOString();
        await db.query(
          "INSERT INTO flux_datasets(id,owner_id,document,raw_content,created_at) VALUES($1,$2,$3,$4,$5)",
          [id, owner, JSON.stringify(imported), text, createdAt],
        );
        return json(res, 201, { id, ...imported, createdAt });
      });
    }
    if (method === "GET" && path === "/api/datasets") {
      const rows = await db.query(
        "SELECT id,document,created_at FROM flux_datasets WHERE owner_id=$1 ORDER BY created_at DESC,id LIMIT 20",
        [owner],
      );
      return json(
        res,
        200,
        rows.map((r) => {
          const d = JSON.parse(String(r.document));
          return {
            id: r.id,
            provenance: d.provenance,
            summary: d.summary,
            createdAt: r.created_at,
          };
        }),
      );
    }
    if (match?.[1] === "datasets" && ["GET", "DELETE"].includes(method)) {
      const [row] = await db.query(
        method === "DELETE"
          ? "DELETE FROM flux_datasets WHERE id=$1 AND owner_id=$2 RETURNING id"
          : "SELECT document,raw_content FROM flux_datasets WHERE id=$1 AND owner_id=$2",
        [match[2], owner],
      );
      if (!row) throw new HttpError(404, "Dataset not found");
      if (method === "GET" && match[3] === "raw") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(String(row.raw_content));
        return;
      }
      return json(
        res,
        200,
        method === "DELETE"
          ? { ok: true }
          : { id: match[2], ...JSON.parse(String(row.document)) },
      );
    }
    throw new HttpError(404, "API route not found");
  }
  async function handler(req: IncomingMessage, res: ServerResponse) {
    const requestId = randomUUID();
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Content-Security-Policy", csp);
    if (options.production)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      if ((req.url?.length ?? 0) > 2048)
        throw new HttpError(414, "URL is too long");
      let path: string;
      try {
        path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      } catch {
        throw new HttpError(400, "Invalid path");
      }
      if (
        path.includes("\0") ||
        path.includes("\\") ||
        path.split("/").some((p) => p.startsWith("."))
      )
        throw new HttpError(404, "Not found");
      if (path.startsWith("/api/") || path === "/api") {
        res.setHeader("Cache-Control", "no-store");
        return await api(req, res, path);
      }
      if (!["GET", "HEAD"].includes(req.method ?? "")) {
        res.setHeader("Allow", "GET, HEAD");
        throw new HttpError(405, "Method not allowed");
      }
      if (!options.staticDirectory) throw new HttpError(404, "Not found");
      const root = resolve(options.staticDirectory);
      let file = resolve(root, "." + path);
      if (!file.startsWith(root + sep) && file !== root)
        throw new HttpError(404, "Not found");
      if (path === "/") file = resolve(root, "index.html");
      try {
        if (!(await stat(file)).isFile()) throw new Error("not file");
      } catch {
        if (extname(path)) throw new HttpError(404, "Not found");
        file = resolve(root, "index.html");
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Content-Length": bytes.length,
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 500;
      if (status === 429) res.setHeader("Retry-After", "60");
      if (status === 500)
        process.stderr.write(
          JSON.stringify({ event: "request_error", requestId }) + "\n",
        );
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof ZodError
            ? error.issues
                .slice(0, 3)
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : "Server could not complete the request";
      json(res, status, { error: message, requestId });
    }
  }
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 64;
  return {
    server,
    jobs,
    close: async () => {
      clearInterval(cleanup);
      if (server.listening)
        await new Promise<void>((resolveClose, reject) => {
          server.close((error) => (error ? reject(error) : resolveClose()));
          server.closeIdleConnections();
        });
      await jobs.stop();
    },
  };
}
