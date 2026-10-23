// Sign in with Monotree: OpenID Connect, authorization code flow with PKCE.
// Follows the partner checklist on https://docs.monotree.com/sign-in-with-monotree/
// You should not need to change this file.

import { b64url, fromB64url } from "./session.ts";
import type { Viewer } from "./access.ts";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type Jwk = JsonWebKey & { kid?: string };

export type IdTokenClaims = Viewer & { name?: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const randomString = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export const challengeFor = async (verifier: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));

// one Worker instance serves many requests, so keep discovery and keys around
let discovery: { issuer: string; document: Discovery } | null = null;
let jwks: { uri: string; keys: Jwk[] } | null = null;

export async function discover(issuer: string): Promise<Discovery> {
  if (discovery?.issuer === issuer) return discovery.document;

  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) {
    // Monotree answers 404 here until a partner client is registered on that server
    throw new Error(`Discovery at ${issuer} answered ${response.status}. Is the client registered on this Monotree server?`);
  }

  const document = (await response.json()) as Discovery;
  if (document.issuer !== issuer) {
    throw new Error(`Discovery says issuer ${document.issuer}, expected ${issuer}. Check MONOTREE_ISSUER.`);
  }

  discovery = { issuer, document };
  return document;
}

async function signingKey(document: Discovery, kid: string): Promise<Jwk | undefined> {
  const find = () => jwks?.uri === document.jwks_uri ? jwks.keys.find((key) => key.kid === kid) : undefined;

  // keys rotate: on an unknown kid, fetch the set again once before giving up
  if (!find()) {
    const response = await fetch(document.jwks_uri);
    if (!response.ok) throw new Error(`JWKS answered ${response.status}`);
    jwks = { uri: document.jwks_uri, keys: ((await response.json()) as { keys: Jwk[] }).keys };
  }

  return find();
}

export function authorizeUrl(
  document: Discovery,
  params: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string; loginHint?: string | null },
): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    // groups: roles and group ids, for the ACCESS rule. No email: the dashboard does not need it
    scope: "openid profile groups",
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  });

  // passed on unchanged, never stored or logged. Never add prompt=login on a launch
  if (params.loginHint) query.set("login_hint", params.loginHint);

  return `${document.authorization_endpoint}?${query}`;
}

export async function exchangeCode(
  document: Discovery,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string },
): Promise<string> {
  const response = await fetch(document.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${params.clientId}:${params.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.verifier,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!response.ok || !body.id_token) {
    throw new Error(`Token exchange failed: ${response.status} ${body.error ?? ""}`.trim());
  }

  return body.id_token;
}

// the checks from the partner checklist: RS256 only, signature by kid, iss, aud,
// exp with at most 60 seconds of clock skew, nonce
export async function verifyIdToken(
  document: Discovery,
  jwt: string,
  expected: { issuer: string; clientId: string; nonce: string },
): Promise<IdTokenClaims> {
  const [header64, payload64, signature64] = jwt.split(".");
  if (!header64 || !payload64 || !signature64) throw new Error("Malformed id_token");

  const header = JSON.parse(decoder.decode(fromB64url(header64)));
  if (header.alg !== "RS256") throw new Error(`Unexpected id_token algorithm ${header.alg}`);

  const jwk = await signingKey(document, header.kid);
  if (!jwk) throw new Error(`No key ${header.kid} in the JWKS`);

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(signature64), encoder.encode(`${header64}.${payload64}`));
  if (!valid) throw new Error("id_token signature does not verify");

  const claims = JSON.parse(decoder.decode(fromB64url(payload64)));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== expected.issuer) throw new Error(`id_token issuer ${claims.iss} is not ${expected.issuer}`);
  if (!audience.includes(expected.clientId)) throw new Error("id_token is for another client");
  if (typeof claims.exp !== "number" || claims.exp + 60 < Date.now() / 1000) throw new Error("id_token has expired");
  if (claims.nonce !== expected.nonce) throw new Error("id_token nonce does not match");
  if (typeof claims.sub !== "string") throw new Error("id_token has no sub");

  return claims;
}
