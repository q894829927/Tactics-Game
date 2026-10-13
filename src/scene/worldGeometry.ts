import { MAP_HEIGHT, MAP_WIDTH, inBounds, type Point } from "../engine/battle.ts";

/** A1 locked units: do not change without updating the art specification and tests. */
export const TILE = 92;
export const WORLD_COLS = 16;
export const WORLD_ROWS = 12;
export const WORLD_WIDTH = WORLD_COLS * TILE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE;
export const TACTICAL_COL = 3;
export const TACTICAL_ROW = 2;
export const TACTICAL_X = TACTICAL_COL * TILE;
export const TACTICAL_Y = TACTICAL_ROW * TILE;
export const TACTICAL_WIDTH = MAP_WIDTH * TILE;
export const TACTICAL_HEIGHT = MAP_HEIGHT * TILE;
export const MIN_ZOOM = 0.60;
export const MAX_ZOOM = 1.85;

export type Camera = { x: number; y: number; zoom: number };
export type Coord = { x: number; y: number };

/** Coordinates are in the same unscaled world space as the 16x12 art stage. */
export function tileWorld(x: number, y: number, center = true): Coord {
  const delta = center ? 0.5 : 0;
  return { x: TACTICAL_X + (x + delta) * TILE, y: TACTICAL_Y + (y + delta) * TILE };
}
export function worldTile(x: number, y: number): Point | null {
  const tileX = Math.floor((x - TACTICAL_X) / TILE);
  const tileY = Math.floor((y - TACTICAL_Y) / TILE);
  return inBounds(tileX, tileY) ? { x: tileX, y: tileY } : null;
}
export function worldScreen(x: number, y: number, camera: Camera): Coord {
  return { x: camera.x + x * camera.zoom, y: camera.y + y * camera.zoom };
}
export function screenWorld(x: number, y: number, camera: Camera): Coord {
  return { x: (x - camera.x) / camera.zoom, y: (y - camera.y) / camera.zoom };
}
export function screenTile(x: number, y: number, camera: Camera): Point | null {
  const position = screenWorld(x, y, camera);
  return worldTile(position.x, position.y);
}

/** Minimap viewport represents the entire scene, including 3x2 decorative margins. */
export function minimapFrame(camera: Camera, viewportWidth: number, viewportHeight: number) {
  const visibleWidth = viewportWidth / camera.zoom;
  const visibleHeight = viewportHeight / camera.zoom;
  const width = Math.min(1, visibleWidth / WORLD_WIDTH);
  const height = Math.min(1, visibleHeight / WORLD_HEIGHT);
  return {
    left: width === 1 ? 0 : Math.min(1 - width, Math.max(0, -camera.x / camera.zoom / WORLD_WIDTH)),
    top: height === 1 ? 0 : Math.min(1 - height, Math.max(0, -camera.y / camera.zoom / WORLD_HEIGHT)),
    width, height,
  };
}
