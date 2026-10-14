import { MAP_HEIGHT, MAP_WIDTH } from "../engine/battle.ts";
import { TILE, WORLD_COLS, WORLD_ROWS, TACTICAL_X, TACTICAL_Y } from "./worldGeometry.ts";
import { MAP_ASSET_FILES } from "./mapAssetFiles.ts";

export type ScenerySprite = {
  id: string;
  file: typeof MAP_ASSET_FILES.tree | typeof MAP_ASSET_FILES.treeBroadleaf |
    typeof MAP_ASSET_FILES.cliff | typeof MAP_ASSET_FILES.shrub |
    typeof MAP_ASSET_FILES.stones | typeof MAP_ASSET_FILES.hill;
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
  const add = (id: string, file: ScenerySprite["file"], x: number, y: number, width: number, height: number,
    terrainCells: ScenerySprite["terrainCells"] = []) => {
    sprites.push({id, file, x, y, width, height, footY: y + height * .87, terrainCells});
  };
  const treeFile = (index: number) => artNoise(index + 1300) > .66
    ? MAP_ASSET_FILES.treeBroadleaf : MAP_ASSET_FILES.tree;
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
      add(`edge-tree-${col}-${row}`, treeFile(row * WORLD_COLS + col), x, y, size, size);
    }
  }
  // Small props in authored woodland gaps, never in playable cells or in the river.
  // Vary spacing and footprint rather than stamping the obstacle sprite along the shore.
  const shrubs = [[212,296,56,46], [154,477,68,52], [224,714,44,42],
    [457,145,70,32], [696,934,78,54], [1050,1022,56,42]] as const;
  shrubs.forEach(([x,y,w,h],i) => add(`edge-shrub-${i}`, MAP_ASSET_FILES.shrub, x,y,w,h));
  const stones = [[225,422,38,30], [239,620,28,26], [433,942,54,34]] as const;
  stones.forEach(([x,y,w,h],i) => add(`edge-stones-${i}`, MAP_ASSET_FILES.stones, x,y,w,h));
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (terrain[y]?.[x] === "F") {
        const size = 82 + artNoise(y * MAP_WIDTH + x) * 6;
        add(`forest-${x}-${y}`, treeFile(y * MAP_WIDTH + x), TACTICAL_X + x * TILE + (TILE-size)/2,
          TACTICAL_Y + y * TILE + (TILE-size)/2, size, size, [{x,y}]);
      }
      if (terrain[y]?.[x] === "H") {
        add(`hill-${x}-${y}`, MAP_ASSET_FILES.hill, TACTICAL_X + x * TILE + 2,
          TACTICAL_Y + y * TILE + 2, TILE-4, TILE-4, [{x,y}]);
      }
      if (terrain[y]?.[x] === "#") {
        // Join adjacent blocked cells into one natural mass; never span a walkable cell.
        const cells = [{x,y}];
        if (terrain[y]?.[x+1] === "#") cells.push({x:x+1,y});
        add(`rock-${x}-${y}`, MAP_ASSET_FILES.cliff, TACTICAL_X + x * TILE + 3,
          TACTICAL_Y + y * TILE + 2, cells.length*TILE-6, TILE-4, cells);
        x += cells.length-1;
      }
    }
  }
  return sprites.sort((a,b) => a.footY-b.footY || a.id.localeCompare(b.id));
}
