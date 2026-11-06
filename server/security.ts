import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secretToken = () => randomBytes(32).toString("base64url");
async function derive(
  password: string,
  salt: string,
  cost = 131072,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: cost, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:131072:8:1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":"),
    legacy = parts.length === 3;
  const algorithm = parts[0],
    salt = parts[legacy ? 1 : 4],
    hex = parts[legacy ? 2 : 5];
  if (
    algorithm !== "scrypt" ||
    (!legacy &&
      (parts.length !== 6 || parts.slice(1, 4).join(":") !== "131072:8:1")) ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(hex ?? "")
  )
    return false;
  return timingSafeEqual(
    await derive(password, salt, legacy ? 16384 : 131072),
    Buffer.from(hex, "hex"),
  );
}
export function cookieToken(req: IncomingMessage): string | null {
  const cookies = (req.headers.cookie ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("flux_session="));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice("flux_session=".length);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function sessionCookie(
  token: string,
  production: boolean,
  clear = false,
): string {
  return `flux_session=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 86400}${production ? "; Secure" : ""}`;
}
export function checkOrigin(req: IncomingMessage, origin: string): void {
  if (req.headers.origin && req.headers.origin !== origin)
    throw new HttpError(403, "Origin is not allowed");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new HttpError(403, "Cross-site requests are not allowed");
}
export class RateLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  constructor(
    private maximum: number,
    private windowMs: number,
    private now = Date.now,
  ) {}
  check(key: string): void {
    const time = this.now();
    if (this.entries.size >= 10000)
      for (const [id, value] of this.entries)
        if (value.until <= time) this.entries.delete(id);
    let entry = this.entries.get(key);
    if (!entry || entry.until <= time) {
      if (this.entries.size >= 10000)
        throw new HttpError(429, "Request capacity reached; retry later");
      entry = { count: 0, until: time + this.windowMs };
      this.entries.set(key, entry);
    }
    if (++entry.count > this.maximum)
      throw new HttpError(429, "Too many requests; retry later");
  }
}
