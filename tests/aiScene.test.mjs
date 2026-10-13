import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../public/assets/maps/red-banner/ai/", import.meta.url);
const assets = {
  "forest-cliff-river-stage.webp": ["c4e4c653329b2642a3cd37e483d87827e166e74e6c34a041adacdd754947a9e8", 374652],
  "forest-cliff-river-minimap.webp": ["e67c4ea0cc4fb9d87ad79f225c449e97d53cae2f791449e57e9e91beb4401955", 70088],
  "forest-reference.webp": ["7d93f953a41e149697045d8a3d68872a58cfe0508d4ceed585a9d05c1a6a0c4a", 49180],
  "cliff-reference.webp": ["0177e11835678040b19f1206450e9192efa12f158f6175119a7b42c8b305acce", 59674],
  "riverbank-reference.webp": ["6a245edf02c05976be40be67ca0cb9983743bc5be2a7e476c6037aa21bd6b115", 59722],
};

test("all five binary AI assets exist and match generated WebP payloads", () => {
  for (const [name, [sha, bytes]] of Object.entries(assets)) {
    const file = new URL(name, root);
    assert.ok(existsSync(file), name);
    const body = readFileSync(file);
    assert.equal(body.length, bytes, name);
    assert.equal(body.toString("ascii", 0, 4), "RIFF", name);
    assert.equal(body.toString("ascii", 8, 12), "WEBP", name);
    assert.equal(createHash("sha256").update(body).digest("hex"), sha, name);
  }
});

test("stage image has a non-interactive world-layer fallback, minimap retains live pins", () => {
  const source = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(source, /imgAsset\("ai\/forest-cliff-river-stage\.webp", 0, 0, WORLD_WIDTH, WORLD_HEIGHT\)/);
  assert.match(source, /paintedScene\.addEventListener\("load"/);
  assert.match(source, /stage\.classList\.add\("has-ai-scenery"\)/);
  assert.match(source, /miniPainting\.src = sceneAsset\("ai\/forest-cliff-river-minimap\.webp"\)/);
  assert.match(source, /miniPainting\.addEventListener\("error"/);
  assert.match(source, /this\.minimapUnits\.appendChild\(pin\)/);
  assert.match(source, /this\.viewportMarker\.style\.left/);
  assert.match(css, /\.world-stage\.has-ai-scenery \.world-environment/);
  assert.match(css, /\.minimap-ai-painting\s*\{[^}]*pointer-events: none/s);
});
