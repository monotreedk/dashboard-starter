// The Worker in front of the dashboard: every page and every /data request
// needs a signed-in Monotree employee who passes the ACCESS rule.
//
//   /auth/initiate   a launch from the Monotree app (Flow 1, no login prompt)
//   /auth/login      sign-in started here (Flow 2, the Monotree login page)
//   /auth/callback   back from Monotree: check the id_token and the ACCESS rule
//   /auth/logout     end the session
//   /auth/me         who is signed in, for the page header
//   /data/<name>     a dataset from src/data.ts
//   anything else    the files in public/
//
// You should not need to change this file. The data lives in src/data.ts and
// the page in public/.

import { allows, parseAccess } from "./access.ts";
import { datasets } from "./data.ts";
import { OpenApiError, openApi } from "./monotree.ts";
import { authorizeUrl, challengeFor, discover, exchangeCode, randomString, verifyIdToken } from "./oidc.ts";
import { cookie, readCookie, seal, unseal } from "./session.ts";

export interface Env {
  ASSETS: Fetcher;
  MONOTREE_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  MONOTREE_API_KEY: string;
  SESSION_SECRET: string;
  ACCESS: string;
}

// how long a sign-in lasts. Access is checked at sign-in, so this is also how
// long a change in Monotree (someone leaving a group) can take to apply
const SESSION_HOURS = 8;
const PENDING_MINUTES = 10;

const SESSION = "mt_session";
const PENDING = "mt_pending";

type Session = { sub: string; name?: string };
type Pending = { state: string; nonce: string; verifier: string; target: string };

const SECURITY_HEADERS: Record<string, string> = {
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
  // add a host here if the page loads scripts or styles from anywhere else
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

const withHeaders = (response: Response, extra: Record<string, string> = {}): Response => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const page = (status: number, title: string, message: string, cookies: string[] = []): Response => {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  for (const value of cookies) headers.append("set-cookie", value);

  return withHeaders(new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 16px;color:#1f2933;background:#f7f8fa}main{max-width:480px;margin:auto}</style>
<main><h1>${escape(title)}</h1><p>${message}</p></main></html>`,
    { status, headers },
  ));
};

const redirect = (location: string, cookies: string[] = []): Response => {
  const headers = new Headers({ location });
  for (const value of cookies) headers.append("set-cookie", value);
  return withHeaders(new Response(null, { status: 302, headers }));
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  withHeaders(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }), extra);

const isLocal = (url: URL) => url.hostname === "localhost" || url.hostname === "127.0.0.1";

// the browser may only ask to return to a path on this site
const safePath = (value: string | null): string =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";

const issuerOf = (env: Env) => env.MONOTREE_ISSUER.replace(/\/+$/, "");

async function startSignIn(env: Env, url: URL, target: string, loginHint: string | null): Promise<Response> {
  const document = await discover(issuerOf(env));
  const pending: Pending = { state: randomString(16), nonce: randomString(16), verifier: randomString(48), target };

  const location = authorizeUrl(document, {
    clientId: env.OIDC_CLIENT_ID,
    redirectUri: `${url.origin}/auth/callback`,
    state: pending.state,
    nonce: pending.nonce,
    challenge: await challengeFor(pending.verifier),
    loginHint,
  });

  const sealed = await seal(env.SESSION_SECRET, pending, PENDING_MINUTES * 60);
  return redirect(location, [cookie(PENDING, sealed, { maxAge: PENDING_MINUTES * 60, path: "/auth", secure: !isLocal(url) })]);
}

// Flow 1: the Monotree app opens /auth/initiate with iss, login_hint and target_link_uri
async function initiate(env: Env, url: URL): Promise<Response> {
  const iss = url.searchParams.get("iss");
  const clientId = url.searchParams.get("client_id");
  const target = url.searchParams.get("target_link_uri") ?? `${url.origin}/`;

  if (iss !== issuerOf(env)) return page(400, "Unknown Monotree", "This dashboard belongs to another Monotree.");
  if (clientId && clientId !== env.OIDC_CLIENT_ID) return page(400, "Unknown client", "This link was meant for another app.");
  if (!target.startsWith(`${url.origin}/`)) return page(400, "Unknown target", "This link points outside the dashboard.");

  const { pathname, search } = new URL(target);
  return startSignIn(env, url, pathname + search, url.searchParams.get("login_hint"));
}

async function callback(env: Env, url: URL, request: Request): Promise<Response> {
  const secure = !isLocal(url);
  const clearPending = cookie(PENDING, "", { maxAge: 0, path: "/auth", secure });
  const sealed = readCookie(request, PENDING);
  const pending = sealed ? await unseal<Pending>(env.SESSION_SECRET, sealed) : null;

  const error = url.searchParams.get("error");
  // Monotree servers from before the groups scope refuse it
  if (error === "invalid_scope") {
    return page(400, "Monotree needs an update", "This Monotree server does not offer the roles and groups the dashboard needs yet. Ask Monotree to update it.", [clearPending]);
  }
  if (error) {
    return page(400, "Sign-in failed", `Monotree said: ${escape(error)}. <a href="/auth/login">Try again</a>.`, [clearPending]);
  }
  if (!pending || pending.state !== url.searchParams.get("state")) {
    return page(400, "Sign-in expired", `The sign-in took too long or was started in another browser. <a href="/auth/login">Try again</a>.`, [clearPending]);
  }

  const issuer = issuerOf(env);
  const document = await discover(issuer);
  const idToken = await exchangeCode(document, {
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    code: url.searchParams.get("code") ?? "",
    redirectUri: `${url.origin}/auth/callback`,
    verifier: pending.verifier,
  });
  const claims = await verifyIdToken(document, idToken, { issuer, clientId: env.OIDC_CLIENT_ID, nonce: pending.nonce });

  let rules;
  try {
    rules = parseAccess(env.ACCESS);
  } catch (problem) {
    console.error(problem);
    return page(500, "Dashboard not set up", "The ACCESS setting is missing or wrong. See src/access.ts.", [clearPending]);
  }

  if (!allows(rules, claims)) {
    return page(403, "No access", "This dashboard is only open to some employees. Ask whoever shared it with you if you think you should have access.", [clearPending]);
  }

  const session: Session = { sub: claims.sub, name: claims.name };
  const sessionCookie = cookie(SESSION, await seal(env.SESSION_SECRET, session, SESSION_HOURS * 3600), {
    maxAge: SESSION_HOURS * 3600,
    path: "/",
    secure,
  });

  return redirect(safePath(pending.target), [clearPending, sessionCookie]);
}

// one result per dataset, shared by every viewer of this Worker instance. The
// Cache API adds a cache across instances; Cloudflare only promises it on a
// custom domain, so don't count on it on workers.dev
const memory = new Map<string, { until: number; value: Promise<unknown> }>();

async function dataset(env: Env, name: string, context: ExecutionContext): Promise<Response> {
  const definition = Object.hasOwn(datasets, name) ? datasets[name] : undefined;
  if (!definition) return json(404, { message: `No dataset called ${name}` });

  const now = Date.now();
  const cached = memory.get(name);
  const cacheKey = new Request(`https://dashboard-cache.invalid/${encodeURIComponent(issuerOf(env))}/${name}`);

  try {
    if (cached && cached.until > now) return json(200, await cached.value);

    const shared = await caches.default.match(cacheKey);
    if (shared) return json(200, await shared.json());

    const value = definition.load(openApi(issuerOf(env), env.MONOTREE_API_KEY));
    memory.set(name, { until: now + definition.cacheSeconds * 1000, value });

    const body = JSON.stringify(await value);
    context.waitUntil(caches.default.put(cacheKey, new Response(body, {
      headers: { "content-type": "application/json", "cache-control": `max-age=${definition.cacheSeconds}` },
    })));

    return json(200, JSON.parse(body));
  } catch (error) {
    memory.delete(name);
    console.error(`dataset ${name}:`, error);

    if (error instanceof OpenApiError && error.status === 429) {
      return json(503, { message: "Monotree is busy, try again shortly." }, { "retry-after": String(error.retryAfter ?? 60) });
    }
    return json(502, { message: "Could not load this data from Monotree." });
  }
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/auth/initiate":
          return await initiate(env, url);
        case "/auth/login":
          return await startSignIn(env, url, safePath(url.searchParams.get("return")), null);
        case "/auth/callback":
          return await callback(env, url, request);
        case "/auth/logout":
          return page(200, "Signed out", `<a href="/auth/login">Sign in again</a>`, [
            cookie(SESSION, "", { maxAge: 0, path: "/", secure: !isLocal(url) }),
          ]);
      }

      const sealed = readCookie(request, SESSION);
      const session = sealed ? await unseal<Session>(env.SESSION_SECRET, sealed) : null;

      if (!session) {
        if (url.pathname.startsWith("/data/") || url.pathname === "/auth/me") return json(401, { message: "Sign in first." });
        return redirect(`/auth/login?return=${encodeURIComponent(url.pathname + url.search)}`);
      }

      if (url.pathname === "/auth/me") return json(200, { sub: session.sub, name: session.name ?? null });
      if (url.pathname.startsWith("/data/")) return await dataset(env, url.pathname.slice("/data/".length), context);

      return withHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      console.error(error);
      return page(500, "Something went wrong", "The dashboard could not reach Monotree. Try again in a moment.");
    }
  },
} satisfies ExportedHandler<Env>;
