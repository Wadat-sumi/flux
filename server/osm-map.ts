import { ZodError } from "zod";
import { mapAreaSchema } from "../src/model/map-area";
import { importOsm } from "./imports";
import { HttpError, RateLimiter } from "./security";

const endpoint = "https://api.openstreetmap.org/api/0.6/map.json";
/** Public read-only map service: fixed host, bounded extracts, no caller-supplied URL or query. */
export class OsmMap {
  private readonly users = new RateLimiter(6, 60000);
  private readonly global = new RateLimiter(30, 60000);
  private active = 0;
  private cache = new Map<
    string,
    { text: string; capturedAt: string; expires: number }
  >();
  constructor(private readonly request: typeof fetch = fetch) {}
  async area(ip: string, input: unknown) {
    const area = mapAreaSchema.parse(input),
      b = area.bounds;
    this.users.check(ip);
    this.global.check("all");
    const padY = 100 / 111194.9266,
      padX = padY / Math.cos(((b.north + b.south) * Math.PI) / 360);
    const bbox = [
      Math.max(-180, b.west - padX),
      Math.max(-85, b.south - padY),
      Math.min(180, b.east + padX),
      Math.min(85, b.north + padY),
    ]
      .map((n) => n.toFixed(7))
      .join(",");
    const url = new URL(endpoint);
    url.searchParams.set("bbox", bbox);
    let data = this.cache.get(bbox);
    if (!data || data.expires <= Date.now()) {
      if (this.active >= 2)
        throw new HttpError(429, "Map service is busy; retry shortly");
      this.active++;
      try {
        const response = await this.request(url, {
          signal: AbortSignal.timeout(12000),
          redirect: "error",
          headers: {
            Accept: "application/json",
            "User-Agent": "Flux/0.1 (+https://github.com/Wadat-sumi/flux)",
          },
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          await response.body?.cancel();
          throw new Error("upstream");
        }
        if (Number(response.headers.get("content-length") ?? 0) > 8_000_000) {
          await response.body?.cancel();
          throw new HttpError(
            413,
            "Map extract exceeds 8 MB; select a smaller area",
          );
        }
        if (!response.body) throw new Error("upstream");
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 8_000_000)
              throw new HttpError(
                413,
                "Map extract exceeds 8 MB; select a smaller area",
              );
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        data = {
          text: Buffer.concat(chunks).toString("utf8"),
          capturedAt: new Date().toISOString(),
          expires: Date.now() + 300000,
        };
        if (this.cache.size >= 4)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(bbox, data);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          502,
          "OpenStreetMap could not be reached. Retry shortly or import an OSM JSON file in Data & cloud",
        );
      } finally {
        this.active--;
      }
    }
    try {
      return importOsm(
        {
          text: data.text,
          metadata: {
            source: url.toString(),
            license: "ODbL 1.0 — © OpenStreetMap contributors",
            capturedAt: data.capturedAt,
          },
        },
        area,
      );
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new HttpError(
          502,
          "OpenStreetMap returned invalid JSON. Retry shortly or import a complete OSM file.",
        );
      if (error instanceof ZodError)
        throw new HttpError(
          422,
          "OSM contains unsupported road attributes or excessive geometry. Try another corridor or review the OSM file; this is a data validation issue, not necessarily a large selection.",
        );
      throw new HttpError(
        422,
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Map conversion failed; retry another corridor",
      );
    }
  }
}
