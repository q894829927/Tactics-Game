/**
 * The 16x12 art stage is sampled as 32x24 microtiles. These are only visual
 * texture/detail cells: they must not create any new tactical hit targets.
 */
import { TILE, WORLD_COLS, WORLD_ROWS } from "./worldGeometry.ts";
import { groundSurfaceAt, type GroundSurface } from "./groundSurface.ts";

export const MICRO_TILE = TILE / 2;
export const MICRO_COLS = WORLD_COLS * 2;
export const MICRO_ROWS = WORLD_ROWS * 2;

export const M1_SLICE = Object.freeze({ col: 10, row: 4, cols: 6, rows: 5 });

/** Stable, tile-addressed sampling avoids texture changes after combat actions. */
export function microTileSeed(col: number, row: number): number {
  let h = Math.imul(col + 47, 374761393) ^ Math.imul(row + 101, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function microTileMaterial(terrain: readonly string[], microCol: number, microRow: number): GroundSurface {
  if (!Number.isInteger(microCol) || !Number.isInteger(microRow) ||
      microCol < 0 || microRow < 0 || microCol >= MICRO_COLS || microRow >= MICRO_ROWS)
    throw new RangeError("Microtile outside the 16x12 art stage");
  return groundSurfaceAt(terrain, Math.floor(microCol / 2), Math.floor(microRow / 2));
}

/**
 * Four-bit boundary mask for a grass terrain cell: N/E/S/W = 1/2/4/8
 * when the adjacent world cell is earth. UI, minimap and render use the same
 * underlying groundSurfaceAt classification, never a separate art grid.
 */
export function grassEdgeMask(terrain: readonly string[], worldCol: number, worldRow: number): number {
  if (groundSurfaceAt(terrain,worldCol,worldRow)!=="grass") return 0;
  const at=(dx:number,dy:number)=>groundSurfaceAt(terrain,worldCol+dx,worldRow+dy);
  return (at(0,-1)==="earth"?1:0) |
    (at(1,0)==="earth"?2:0) |
    (at(0,1)==="earth"?4:0) |
    (at(-1,0)==="earth"?8:0);
}

/** Reports exactly the 6x5 right-bank vertical slice of the shared 16x12 map. */
export function m1SliceGround(terrain: readonly string[]) {
  const tiles=[] as {col:number;row:number;surface:GroundSurface;grassEdges:number}[];
  for(let row=M1_SLICE.row;row<M1_SLICE.row+M1_SLICE.rows;row++)
    for(let col=M1_SLICE.col;col<M1_SLICE.col+M1_SLICE.cols;col++)
      tiles.push({col,row,surface:groundSurfaceAt(terrain,col,row),
        grassEdges:grassEdgeMask(terrain,col,row)});
  return tiles;
}
