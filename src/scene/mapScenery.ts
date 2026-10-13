import { MAP_HEIGHT, MAP_WIDTH } from "../engine/battle.ts";
import { TILE, WORLD_COLS, WORLD_ROWS, TACTICAL_X, TACTICAL_Y } from "./worldGeometry.ts";

export type ScenerySprite = {
  id: string;
  file: "modular/tree-spruce.png" | "modular/cliff-moss.png";
  x: number; y: number; width: number; height: number;
  footY: number;
  terrainCell: { x: number; y: number } | null;
};

/** Stable variation: camera movement and unit actions never shuffle the scenery. */
export function artNoise(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Water is decorative, wholly east of the playable grid. */
export function riverBankX(y: number): number {
  let rockBank = 0;
  for (let i=0; i<5; i++) rockBank += 94 * Math.exp(-(((y-(179+i*196))/58)**2));
  return TACTICAL_X + MAP_WIDTH * TILE + 64 + Math.sin(y / 137) * 22 + rockBank;
}

export function buildMapScenery(terrain: readonly string[]): ScenerySprite[] {
  const sprites: ScenerySprite[] = [];
  const add = (id: string, tree: boolean, x: number, y: number, width: number, height: number,
    terrainCell: ScenerySprite["terrainCell"] = null) => {
    sprites.push({id, file: tree ? "modular/tree-spruce.png" : "modular/cliff-moss.png",
      x, y, width, height, footY: y + height * .87, terrainCell});
  };
  for (let row = 0; row < WORLD_ROWS; row++) {
    for (let col = 0; col < WORLD_COLS; col++) {
      if (col >= 13 && row >= 2) continue;
      if (!(col <= 2 || row <= 1 || row >= 10)) continue;
      const noise = artNoise(row * WORLD_COLS + col);
      let size = 138 + noise * 22;
      let x = col * TILE - 18 + noise * 15;
      let y = row * TILE - 22 + noise * 12;
      if (col === 2 && row < 10) { size = 86; x = col * TILE + 2; }
      if (row === 1 && col >= 3) { size = 122; y = 53; }
      if (row >= 10) y = row * TILE + 10;
      add(`edge-tree-${col}-${row}`, true, x, y, size, size);
    }
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (terrain[y]?.[x] === "F") {
        const size = 82 + artNoise(y * MAP_WIDTH + x) * 6;
        add(`forest-${x}-${y}`, true, TACTICAL_X + x * TILE + (TILE-size)/2,
          TACTICAL_Y + y * TILE + (TILE-size)/2, size, size, {x,y});
      }
      if (terrain[y]?.[x] === "#") {
        // One independent rock piece per blocked cell; it never covers a walkable cell.
        add(`wall-${x}-${y}`, false, TACTICAL_X + x * TILE + 2,
          TACTICAL_Y + y * TILE + 14, TILE-4, 68, {x,y});
      }
    }
  }
  for (let index = 0; index < 5; index++) {
    const y = 135 + index * 196;
    add(`river-cliff-${index}`, false, TACTICAL_X + MAP_WIDTH * TILE + 5,
      y, 164 + artNoise(index + 240) * 28, 88);
  }
  return sprites.sort((a,b) => a.footY-b.footY || a.id.localeCompare(b.id));
}
