import { MAP_HEIGHT, MAP_WIDTH } from "../engine/battle.ts";
import { TILE, WORLD_COLS, WORLD_ROWS, TACTICAL_X, TACTICAL_Y } from "./worldGeometry.ts";
import { MAP_ASSET_FILES } from "./mapAssetFiles.ts";

export type ScenerySprite = {
  id: string;
  file: typeof MAP_ASSET_FILES.tree | typeof MAP_ASSET_FILES.cliff;
  x: number; y: number; width: number; height: number;
  footY: number;
  terrainCells: { x: number; y: number }[];
};

/** Stable variation: camera movement and unit actions never shuffle the scenery. */
export function artNoise(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Water is decorative, wholly east of the playable grid. */
export function riverBankX(y: number): number {
  // Unequal broad bends and small shoreline variation, independent of rock placement.
  return TACTICAL_X + MAP_WIDTH * TILE + 80 +
    Math.sin(y / 292 + .4) * 28 + Math.sin(y / 143 + 1.7) * 15 + Math.sin(y / 47 + .8) * 5;
}

export function buildMapScenery(terrain: readonly string[]): ScenerySprite[] {
  const sprites: ScenerySprite[] = [];
  const add = (id: string, tree: boolean, x: number, y: number, width: number, height: number,
    terrainCells: ScenerySprite["terrainCells"] = []) => {
    sprites.push({id, file: tree ? MAP_ASSET_FILES.tree : MAP_ASSET_FILES.cliff,
      x, y, width, height, footY: y + height * .87, terrainCells});
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
          TACTICAL_Y + y * TILE + (TILE-size)/2, size, size, [{x,y}]);
      }
      if (terrain[y]?.[x] === "#") {
        // Join adjacent blocked cells into one natural mass; never span a walkable cell.
        const cells = [{x,y}];
        if (terrain[y]?.[x+1] === "#") cells.push({x:x+1,y});
        add(`rock-${x}-${y}`, false, TACTICAL_X + x * TILE + 3,
          TACTICAL_Y + y * TILE + 2, cells.length*TILE-6, TILE-4, cells);
        x += cells.length-1;
      }
    }
  }
  return sprites.sort((a,b) => a.footY-b.footY || a.id.localeCompare(b.id));
}
