import { openDatabase, migrate } from "../server/database";
import { createApp, type AppOptions } from "../server/app";
import type { User } from "../src/model/backend";

export interface Auth {
  cookie: string;
  csrf: string;
  user: User;
}
export async function backendFixture(
  options: Partial<Omit<AppOptions, "db">> & { directory?: string } = {},
) {
  const db = await openDatabase({ directory: options.directory });
  await migrate(db);
  const origin = options.origin ?? "http://127.0.0.1:5173";
  const app = await createApp({
    db,
    origin,
    allowRegistration: true,
    authLimit: 100,
    ...options,
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const address = app.server.address();
  if (!address || typeof address === "string")
    throw new Error("No test listener");
  const url = `http://127.0.0.1:${address.port}`;
  async function request<T = Record<string, unknown>>(
    path: string,
    method = "GET",
    data?: unknown,
    auth?: Auth,
    headers: Record<string, string> = {},
  ) {
    const start = performance.now();
    const response = await fetch(url + path, {
      method,
      headers: {
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth ? { Cookie: auth.cookie, "X-Flux-CSRF": auth.csrf } : {}),
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const raw = await response.text();
    let parsed: T;
    try {
      parsed = JSON.parse(raw) as T;
    } catch {
      parsed = raw as T;
    }
    return {
      status: response.status,
      data: parsed,
      headers: response.headers,
      elapsed: performance.now() - start,
    };
  }
  async function register(email: string): Promise<Auth> {
    const result = await request<{ user: User; csrf: string }>(
      "/api/auth/register",
      "POST",
      { email, password: "Flux-test-phrase-2026!" },
    );
    if (result.status !== 201)
      throw new Error(
        `Test registration failed: ${JSON.stringify(result.data)}`,
      );
    return {
      ...result.data,
      cookie: result.headers.get("set-cookie")!.split(";")[0],
    };
  }
  return {
    db,
    app,
    url,
    origin,
    request,
    register,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
export async function waitForJob(
  context: Awaited<ReturnType<typeof backendFixture>>,
  id: string,
  auth: Auth,
) {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const { data } = await context.request<
      import("../src/model/backend").ServerJob
    >(`/api/jobs/${id}`, "GET", undefined, auth);
    if (!["queued", "running"].includes(data.status)) return data;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Server job did not finish within test deadline");
}
