import { createHash } from "node:crypto";
import { z } from "zod";
import { cities } from "../src/model/cities";
import { HttpError, RateLimiter } from "./security";

export const tomtomInputSchema = z
  .object({
    city: z.enum([
      "bengaluru",
      "mumbai",
      "chennai",
      "pune",
      "hyderabad",
      "delhi",
    ]),
    latitude: z.number().finite().min(6).max(37),
    longitude: z.number().finite().min(68).max(98),
  })
  .strict()
  .superRefine((value, context) => {
    const city = cities.find((c) => c.id === value.city)!;
    if (
      Math.abs(value.latitude - city.latitude) > 0.5 ||
      Math.abs(value.longitude - city.longitude) > 0.5
    )
      context.addIssue({
        code: "custom",
        message: "Point must lie within the selected city region",
      });
  });
const nonnegative = z.number().finite().min(0);
export const tomtomResponseSchema = z.object({
  flowSegmentData: z.object({
    currentSpeed: nonnegative.max(300),
    freeFlowSpeed: nonnegative.max(300),
    currentTravelTime: nonnegative.max(86400),
    freeFlowTravelTime: nonnegative.max(86400),
    confidence: z.number().finite().min(0).max(1),
    roadClosure: z.boolean(),
    coordinates: z.object({
      coordinate: z
        .array(
          z.object({
            latitude: z.number().finite().min(-90).max(90),
            longitude: z.number().finite().min(-180).max(180),
          }),
        )
        .min(2)
        .max(2000),
    }),
  }),
});
export class TomTom {
  private userLimit = new RateLimiter(10, 60000);
  private globalLimit = new RateLimiter(60, 60000);
  private active = 0;
  constructor(
    private key?: string,
    private transport: typeof fetch = fetch,
  ) {}
  get enabled() {
    return Boolean(this.key);
  }
  async flow(owner: string, raw: unknown) {
    const input = tomtomInputSchema.parse(raw);
    if (!this.key)
      throw new HttpError(
        503,
        "TomTom is not configured. Connect the server to its Azure Key Vault secret; never enter a key in the browser.",
      );
    this.userLimit.check(owner);
    this.globalLimit.check("tomtom");
    if (this.active >= 4)
      throw new HttpError(429, "Traffic provider is busy; retry shortly");
    this.active++;
    try {
      // Fixed official JSON endpoint: no user-controlled host/path, redirects or JSONP.
      const url = new URL(
        "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/15/json",
      );
      url.searchParams.set("key", this.key);
      url.searchParams.set("point", `${input.latitude},${input.longitude}`);
      url.searchParams.set("unit", "kmph");
      const response = await this.transport(url, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "application/json" },
      });
      if (response.status === 429)
        throw new HttpError(503, "TomTom quota reached; retry later");
      if (!response.ok)
        throw new HttpError(
          502,
          response.status === 403 || response.status === 401
            ? "TomTom rejected the server credential; contact the deployment owner"
            : "TomTom did not return usable traffic data",
        );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new HttpError(502, "TomTom returned an unexpected format");
      if (Number(response.headers.get("content-length") ?? 0) > 200000)
        throw new HttpError(502, "Traffic response exceeds safety limit");
      const reader = response.body?.getReader();
      if (!reader) throw new HttpError(502, "Empty traffic response");
      const pieces: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 200000) {
          await reader.cancel();
          throw new HttpError(502, "Traffic response exceeds safety limit");
        }
        pieces.push(value);
      }
      const text = Buffer.concat(pieces).toString("utf8"),
        parsed = tomtomResponseSchema.parse(JSON.parse(text)).flowSegmentData;
      return {
        provider: "TomTom",
        ...input,
        retrievedAt: new Date().toISOString(),
        attribution: `Traffic data © ${new Date().getUTCFullYear()} TomTom`,
        source:
          "https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data",
        sha256: createHash("sha256").update(text).digest("hex"),
        unit: "km/h",
        currentSpeed: parsed.currentSpeed,
        freeFlowSpeed: parsed.freeFlowSpeed,
        currentTravelTime: parsed.currentTravelTime,
        freeFlowTravelTime: parsed.freeFlowTravelTime,
        confidence: parsed.confidence,
        roadClosure: parsed.roadClosure,
        coordinates: parsed.coordinates.coordinate,
        warnings: [
          "Nearest-segment traffic is a provider estimate, not an OD count or a legal speed limit.",
          "retrievedAt records request time, not an independently supplied observation timestamp. Confirm geographic/directional matching and observation horizon before comparison.",
          "Data is displayed transiently and is not saved to the database or report exports. Retention and reuse require the appropriate TomTom agreement.",
        ],
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Never forward upstream errors, request URLs, credentials, or arbitrary payload fields.
      throw new HttpError(
        502,
        "Traffic provider request failed or returned invalid data",
      );
    } finally {
      this.active--;
    }
  }
}
export type TrafficObservation = Awaited<ReturnType<TomTom["flow"]>>;
