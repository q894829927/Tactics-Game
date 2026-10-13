import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
const root = new URL("../public/assets/maps/red-banner/", import.meta.url);
const files = ["ground-grass-a.svg","ground-grass-b.svg","ground-path-a.svg","forest-cluster-a.svg","forest-cluster-b.svg","cliff-face-a.svg","cliff-face-b.svg","river-flow-a.svg","river-bank-a.svg","bridge-wood-a.svg","camp-platform-a.svg","fog-low-a.svg"];
const board = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");

test("A2-2 original art files have safe standalone SVG roots", () => {
  assert.equal(files.length, 12);
  for (const file of files) {
    const url = new URL(file, root);
    assert.ok(existsSync(url), file);
    const svg = readFileSync(url, "utf8");
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/);
    assert.match(svg, /<\/svg>/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:\/\//i);
    assert.ok(svg.length < 36000, file);
  }
});

test("A2-2 art is routed through Vite base and cannot steal clicks", () => {
  assert.match(board, /import\.meta\.env\.BASE_URL/);
  assert.match(board, /buildMapScenery\(battle\.terrain\)/);
  assert.match(board, /environment\.appendChild\(sprite\)/);
  assert.match(board, /sprite\.addEventListener\("error"/);
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(css, /\.scene-art-sprite \{[^}]*pointer-events: none/s);
  assert.match(css, /\.world-environment, \.world-foreground, \.world-ground \{ pointer-events: none !important/);
});

test("A2-2 asset register matches files and records generated originals", () => {
  const m = readFileSync(new URL("../docs/A1-ASSET-MANIFEST.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
  assert.equal(m.length, 18); // header + 12 original SVG fallbacks + 5 AI raster assets
  for (const file of files) {
    assert.ok(m.some(line => line.includes(","+file+",")), file);
  }
  for (const line of m.slice(1, 13)) {
    assert.match(line, /,original_vector,project_original,,integrated$/);
  }
  for (const line of m.slice(13)) {
    assert.match(line, /,ai_generated,project_ai_generated,,(?:integrated|in_review)$/);
  }
  for (const name of ["forest-cliff-river-stage.webp", "forest-cliff-river-minimap.webp", "forest-reference.webp", "cliff-reference.webp", "riverbank-reference.webp"]) {
    assert.ok(m.some(line => line.includes(",ai/"+name+",")), name);
  }
});
