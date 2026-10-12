import assert from "node:assert/strict";
import test from "node:test";
import { clampCameraOffset } from "../src/scene/cameraBounds.ts";

test("small maps remain centered when initially centered, but can pan", () => {
  // A 10x8 map viewed at 60% zoom fits inside a large desktop viewport.
  const viewportW = 1280;
  const mapW = 10 * 92 * 0.6;
  const centered = (viewportW - mapW) / 2;
  assert.equal(clampCameraOffset(centered, mapW, viewportW), centered);
  assert.equal(clampCameraOffset(centered + 100, mapW, viewportW), centered + 100);
  assert.equal(clampCameraOffset(centered - 100, mapW, viewportW), centered - 100);
});

test("small map panning is bounded by viewport edges on both axes", () => {
  const worldW = 552, worldH = 441.6;
  const viewW = 1280, viewH = 900;
  assert.equal(clampCameraOffset(-200, worldW, viewW), 0);
  assert.equal(clampCameraOffset(2000, worldW, viewW), viewW - worldW);
  assert.equal(clampCameraOffset(-200, worldH, viewH), 0);
  assert.equal(clampCameraOffset(2000, worldH, viewH), viewH - worldH);
});

test("large maps cannot pan past the viewport; exact fits are stable", () => {
  assert.equal(clampCameraOffset(50, 1500, 900), 0);
  assert.equal(clampCameraOffset(-2000, 1500, 900), -600);
  assert.equal(clampCameraOffset(-200, 1500, 900), -200);
  assert.equal(clampCameraOffset(0, 900, 900), 0);
  assert.equal(clampCameraOffset(100, 900, 900), 0);
});

test("zoom across the fit threshold preserves legal movable camera positions", () => {
  const viewport = 1000;
  assert.equal(clampCameraOffset(240, 600, viewport), 240);
  assert.equal(clampCameraOffset(240, 1200, viewport), 0);
  assert.equal(clampCameraOffset(-120, 1200, viewport), -120);
  assert.equal(clampCameraOffset(-120, 600, viewport), 0);
});
