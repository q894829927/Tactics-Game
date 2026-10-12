import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("src/version.ts");
const changelog = read("CHANGELOG.md");
const html = read("index.html");
const main = read("src/main.ts");

test("single four-part version source and changelog agree", () => {
  const match = source.match(/export const GAME_VERSION = "(v\d+\.\d+\.\d+\.\d+)" as const;/);
  assert.ok(match, "missing a four-part GAME_VERSION");
  const latest = changelog.match(/^## (v\d+\.\d+\.\d+\.\d+) — /m);
  assert.equal(latest?.[1], match[1]);
  assert.match(changelog, /### 变更内容/);
});

test("UI reads version only from source; npm version remains valid", () => {
  assert.match(html, /id="game-version"/);
  assert.doesNotMatch(html, /<small[^>]*class="version"[^>]*>v\d/);
  assert.match(main, /import \{ GAME_VERSION \} from "\.\/version\.ts"/);
  assert.match(main, /get\("game-version"\)\.textContent = GAME_VERSION/);
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  assert.ok(pkg.scripts.verify.includes("version:check"));
});

test("instructions explicitly require version and changelog every update", () => {
  assert.match(read("AGENTS.md"), /每次开发更新必须递增版本号/);
  assert.match(read("docs/VERSIONING.md"), /每次开发必须同时更新版本和 CHANGELOG/);
});
