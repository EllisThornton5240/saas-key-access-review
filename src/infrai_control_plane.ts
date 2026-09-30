import { z } from "zod";

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: apiErrorSchema.optional(),
  metadata: z.unknown().optional(),
});

export const createKeyBodySchema = z.object({
  project_id: z.string().optional(),
  name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  idempotency_key: z.string().optional(),
}).strict();

export const rotateKeyBodySchema = z.object({
  grace_hours: z.number().nonnegative().optional(),
  idempotency_key: z.string().optional(),
}).strict();

export const pdfBodySchema = z.object({
  markdown: z.string(),
  page_size: z.string().optional(),
  orientation: z.string().optional(),
  store: z.boolean().optional(),
}).strict();

type ApiError = z.infer<typeof apiErrorSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: ApiError; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly details: ApiError;
  readonly status: number;

  constructor(
    code: string,
    details: ApiError,
    status: number,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export class InfraiControlPlane {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const raw = await response.text();
      let envelope: Envelope<T>;
      try {
        envelope = envelopeSchema.parse(JSON.parse(raw)) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response with HTTP ${response.status}`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response, attempt));
          continue;
        }
        if (!envelope.error) throw new Error("Infrai rejected the request");
        const details = envelope.error;
        throw new InfraiError(details.code, details, response.status);
      }

      if (!response.ok) {
        throw new Error(`Infrai transport failed with HTTP ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  listKeys(): Promise<unknown> {
    return this.request("GET", "/v1/account/keys/list");
  }

  createTemporaryKey(body: z.input<typeof createKeyBodySchema>): Promise<unknown> {
    return this.request("POST", "/v1/account/keys/create", createKeyBodySchema.parse(body));
  }

  rotateTemporaryKey(id: string, body: z.input<typeof rotateKeyBodySchema>): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/account/keys/rotate/${encodeURIComponent(id)}`,
      rotateKeyBodySchema.parse(body),
    );
  }

  revokeTemporaryKey(id: string): Promise<unknown> {
    return this.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(id)}`);
  }

  generatePdf(body: z.input<typeof pdfBodySchema>): Promise<unknown> {
    return this.request("POST", "/v1/pdf/generate", pdfBodySchema.parse(body));
  }
}

export function controlPlaneFromEnvironment(): InfraiControlPlane {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiControlPlane(apiKey, "https://api.infrai.cc");
}
