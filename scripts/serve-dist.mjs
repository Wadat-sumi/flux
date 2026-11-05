// Local production QA server. Azure, not this Node process, hosts the deployed app.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import process from "node:process";

const root = resolve("dist");
const config = JSON.parse(
  readFileSync(resolve(root, "staticwebapp.config.json"), "utf8"),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  for (const [name, value] of Object.entries(config.globalHeaders))
    res.setHeader(name, value);
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  if (req.url.length > 2048) {
    res.writeHead(414);
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (
    pathname.includes("\0") ||
    pathname.includes("\\") ||
    pathname.split("/").some((part) => part === ".." || part.startsWith("."))
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  let path = resolve(root, "." + pathname);
  if (!path.startsWith(root + sep) && path !== root) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (pathname === "/" || (!existsSync(path) && !extname(path)))
    path = resolve(root, "index.html");
  try {
    const data = readFileSync(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});
server.listen(4173, "127.0.0.1", () =>
  process.stdout.write("Flux production QA: http://127.0.0.1:4173\n"),
);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
