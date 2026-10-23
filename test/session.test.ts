import { expect, test } from "bun:test";
import { seal, unseal } from "../src/session.ts";

const secret = "a-long-random-secret-for-the-tests-only";

test("a sealed value comes back", async () => {
  const sealed = await seal(secret, { sub: "512", name: "Jane" }, 60);
  expect(await unseal(secret, sealed)).toMatchObject({ sub: "512", name: "Jane" });
});

test("the value is encrypted, not just signed", async () => {
  const sealed = await seal(secret, { name: "Jane" }, 60);
  expect(atob(sealed.replace(/-/g, "+").replace(/_/g, "/").split(".")[0] ?? "")).not.toContain("Jane");
});

test("another secret cannot open it", async () => {
  const sealed = await seal(secret, { sub: "512" }, 60);
  expect(await unseal("another-secret-another-secret-another", sealed)).toBeNull();
});

test("a tampered value is refused", async () => {
  const sealed = await seal(secret, { sub: "512" }, 60);
  const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  expect(await unseal(secret, flipped)).toBeNull();
});

test("an expired value is refused", async () => {
  const sealed = await seal(secret, { sub: "512" }, -1);
  expect(await unseal(secret, sealed)).toBeNull();
});

test("garbage is refused, not thrown", async () => {
  expect(await unseal(secret, "not-a-cookie")).toBeNull();
  expect(await unseal(secret, "")).toBeNull();
});
