// Snapshot mode: bake the data into a static copy of the page, with no sign-in.
//
//   bun scripts/snapshot.ts            (or: node scripts/snapshot.ts, Node 23.6+)
//   npx wrangler deploy --config wrangler.snapshot.jsonc
//
// ANYONE WHO HAS THE LINK SEES THE DATA, including people who have left the
// company and anyone a link is forwarded to. Read "Snapshot mode" in AGENTS.md
// before you use this. Only company-wide numbers, never named people.
//
// The page lands in snapshot/<random>/, so the link cannot be guessed. Run the
// script again for fresh data and a new link; the old link stops working at the
// next deploy.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { datasets } from "../src/data.ts";
import { openApi } from "../src/monotree.ts";
import { randomString } from "../src/oidc.ts";

// settings from the environment, then .dev.vars, then the vars in wrangler.jsonc
const devVars: Record<string, string> = existsSync(".dev.vars")
  ? Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n")
      .filter((line) => /^\s*[A-Z_]+\s*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]))
  : {};
const wranglerVars: Record<string, string> = JSON.parse(
  readFileSync("wrangler.jsonc", "utf8").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"),
).vars ?? {};

const setting = (name: string): string => {
  const value = process.env[name] || devVars[name] || wranglerVars[name];
  if (!value) throw new Error(`Set ${name} in .dev.vars or the environment.`);
  return value;
};

const issuer = setting("MONOTREE_ISSUER").replace(/\/+$/, "");
const api = openApi(issuer, setting("MONOTREE_API_KEY"));

const loaded: Record<string, unknown> = {};
for (const [name, dataset] of Object.entries(datasets)) {
  // a snapshot has no viewer, so it holds the shared datasets only
  if (dataset.viewerKey) {
    console.log(`skipped ${name}: per viewer`);
    continue;
  }
  loaded[name] = await dataset.load(api);
  console.log(`loaded ${name}`);
}

const folder = randomString(24);
const out = join("snapshot", folder);

rmSync("snapshot", { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of readdirSync("public")) {
  const source = readFileSync(join("public", file));
  if (file === "index.html") {
    writeFileSync(join(out, file), source.toString().replace("<html lang=\"en\">", "<html lang=\"en\" data-snapshot>"));
  } else {
    writeFileSync(join(out, file), source);
  }
}

writeFileSync(join(out, "data.json"), JSON.stringify({ generated_at: new Date().toISOString(), datasets: loaded }));

// keep the page out of search engines, and the link out of other sites' logs
writeFileSync(join("snapshot", "_headers"), [
  "/*",
  "  X-Robots-Tag: noindex, nofollow",
  "  Referrer-Policy: no-referrer",
  "  X-Content-Type-Options: nosniff",
  "  Cache-Control: no-store",
  "",
].join("\n"));
writeFileSync(join("snapshot", "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`\nSnapshot written to ${out}/`);
console.log(`Deploy:  npx wrangler deploy --config wrangler.snapshot.jsonc`);
console.log(`Link:    https://<your-worker-host>/${folder}/`);
