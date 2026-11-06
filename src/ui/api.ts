let csrf = "";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-Flux-CSRF": csrf }),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error ?? "Server request failed",
    );
  return result as T;
}
