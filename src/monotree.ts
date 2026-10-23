// A small client for the Monotree Open API: https://docs.monotree.com/open-api/
// Used by the Worker and by the snapshot script. The key never leaves the server.

// plain fields, not constructor parameter properties: node runs this file
// for the snapshot script and cannot strip those
export class OpenApiError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export type OpenApi = {
  // one request, e.g. get("/stats/users") or get("/stats/engagement", { granularity: "month" })
  get: <T = any>(path: string, query?: Record<string, string | number>) => Promise<T>;
  // every page of a list endpoint, following links.next
  all: <T = any>(path: string, query?: Record<string, string | number>) => Promise<T[]>;
};

export function openApi(issuer: string, key: string): OpenApi {
  const request = async (url: string) => {
    const response = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });

    if (response.status === 429) {
      // 60 requests a minute per key by default: https://docs.monotree.com/rate-limiting/
      throw new OpenApiError(429, "Monotree rate limit reached", Number(response.headers.get("retry-after") ?? 60));
    }
    if (!response.ok) {
      // a 403 usually means the key lacks a scope, or the feature is off for this company
      throw new OpenApiError(response.status, `Monotree answered ${response.status} for ${new URL(url).pathname}: ${await response.text()}`);
    }

    return response.json() as Promise<any>;
  };

  const url = (path: string, query: Record<string, string | number> = {}) => {
    const params = new URLSearchParams(Object.entries(query).map(([name, value]) => [name, String(value)]));
    return `${issuer}/api/open/v1${path}${params.size ? `?${params}` : ""}`;
  };

  return {
    get: (path, query) => request(url(path, query)),

    async all(path, query = {}) {
      const rows = [];
      let next: string | null = url(path, { per_page: 50, ...query });

      while (next) {
        const page = await request(next);
        rows.push(...page.data);
        next = page.links?.next ?? null;
      }

      return rows;
    },
  };
}
