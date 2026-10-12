import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const matchVersion = source => {
  const match = source.match(/^export const GAME_VERSION = "(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))" as const;\s*$/m);
  if (!match) throw new Error("src/version.ts: expected a single four-part GAME_VERSION export");
  return match[1];
};
const parts = value => value.slice(1).split(".").map(Number);
const fail = message => { throw new Error("Version policy: " + message); };
const head = matchVersion(read("src/version.ts"));
const changelog = read("CHANGELOG.md");
const heading = changelog.match(/^## (v\d+\.\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/m);
if (!heading || heading[1] !== head) fail("top CHANGELOG.md heading must match " + head);
const entry = changelog.slice(changelog.indexOf(heading[0]) + heading[0].length).split(/\n## v\d+\.\d+\.\d+\.\d+ — /)[0];
const changeLines = entry.split("\n").filter(line => /^- \S/.test(line));
if (!entry.includes("### 变更内容") || changeLines.length === 0 || !entry.includes("**类型：**")) {
  fail("newest CHANGELOG entry must state a type and at least one concrete change");
}
let previousSource;
try { previousSource = execFileSync("git", ["show", "HEAD^:src/version.ts"], {encoding:"utf8", stdio:["ignore","pipe","ignore"]}); }
catch { previousSource = null; }
const previous = previousSource ? matchVersion(previousSource) : null;
const changed = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {encoding:"utf8"})
  .trim().split("\n").filter(Boolean);
if (!changed.includes("src/version.ts") || !changed.includes("CHANGELOG.md")) {
  fail("each main commit must update both src/version.ts and CHANGELOG.md");
}
if (!previous) {
  if (head !== "v0.1.0.0") fail("first migration must establish v0.1.0.0 baseline");
} else {
  const old = parts(previous), now = parts(head);
  let valid = false;
  for (let level=0; level<4; level++) {
    const prefixSame = old.slice(0, level).every((n, i) => n === now[i]);
    const increaseOne = now[level] === old[level] + 1;
    const lowerReset = now.slice(level + 1).every(n => n === 0);
    if (prefixSame && increaseOne && lowerReset) valid = true;
  }
  if (!valid) fail("invalid bump from " + previous + " to " + head + "; increment exactly one segment and reset lower ones");
  const previousLog = execFileSync("git", ["show","HEAD^:CHANGELOG.md"], {encoding:"utf8",stdio:["ignore","pipe","ignore"]});
  const oldSections = previousLog.slice(previousLog.indexOf("\n## "));
  if (!changelog.includes(oldSections)) fail("older changelog records must be preserved");
}
console.log("Version check passed:", previous ? previous + " -> " + head : head + " (baseline)", "; changes:", changeLines.length);
