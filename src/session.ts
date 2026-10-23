// Encrypted cookies, so the Worker needs no database.
//
// A value is sealed with AES-GCM under a key derived from SESSION_SECRET. GCM
// also authenticates, so a cookie that was changed, or sealed with another
// secret, opens as null. Changing SESSION_SECRET signs everyone out.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const b64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64url = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));

const keys = new Map<string, Promise<CryptoKey>>();

const keyFor = (secret: string): Promise<CryptoKey> => {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle
      .digest("SHA-256", encoder.encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
    keys.set(secret, key);
  }
  return key;
};

export async function seal(secret: string, value: object, maxAgeSeconds: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = encoder.encode(JSON.stringify({ ...value, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(secret), body);

  return `${b64url(iv)}.${b64url(new Uint8Array(sealed))}`;
}

export async function unseal<T extends object>(secret: string, sealed: string): Promise<(T & { exp: number }) | null> {
  try {
    const [iv, body] = sealed.split(".");
    if (!iv || !body) return null;

    const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await keyFor(secret), fromB64url(body));
    const value = JSON.parse(decoder.decode(opened));

    return typeof value.exp === "number" && value.exp > Date.now() / 1000 ? value : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Lax, not Strict: the sign-in callback is a redirect from Monotree, another
// site, and a Strict cookie would not be sent with it
export function cookie(name: string, value: string, options: { maxAge: number; path: string; secure: boolean }): string {
  return [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}
