import assert from "node:assert/strict";
import test from "node:test";
import { loadMapAsset, MAP_ASSET_FILES } from "../src/scene/mapAssets.ts";

test("repeated world/minimap art requests share one immutable cached response and Blob URL", async () => {
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async (url,options)=>{
    calls++;
    assert.equal(options.cache,"force-cache");
    assert.equal(url,"/games/tactics/assets/maps/red-banner/"+MAP_ASSET_FILES.tree);
    return new Response("test-image-response",{headers:{"Content-Type":"image/webp"}});
  };
  try {
    const a=loadMapAsset(MAP_ASSET_FILES.tree),b=loadMapAsset(MAP_ASSET_FILES.tree);
    assert.equal(a,b);
    const urls=await Promise.all([a,b,loadMapAsset(MAP_ASSET_FILES.tree)]);
    assert.equal(calls,1);
    assert.ok(urls[0].startsWith("blob:"));
    assert.equal(new Set(urls).size,1);
    URL.revokeObjectURL(urls[0]);
  } finally {globalThis.fetch=originalFetch;}
});

test("network failure preserves the ordinary image fallback URL", async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async ()=>{throw new Error("offline");};
  try {
    const url=await loadMapAsset(MAP_ASSET_FILES.cliff);
    assert.equal(url,"/games/tactics/assets/maps/red-banner/"+MAP_ASSET_FILES.cliff);
  } finally {globalThis.fetch=originalFetch;}
});
