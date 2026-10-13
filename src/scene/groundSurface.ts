import { MAP_WIDTH, MAP_HEIGHT } from "../engine/battle.ts";
import { TILE, TACTICAL_X, TACTICAL_Y } from "./worldGeometry.ts";

export type GroundSurface = "earth" | "grass";

/** Material decisions use the same terrain codes as movement, never an unrelated art map. */
export function groundSurfaceAt(terrain: readonly string[], worldCol: number, worldRow: number): GroundSurface {
  const x = worldCol-TACTICAL_X/TILE, y = worldRow-TACTICAL_Y/TILE;
  if (x<0 || y<0 || x>=MAP_WIDTH || y>=MAP_HEIGHT) return "grass";
  const code = terrain[y]?.[x];
  return code==="G" || code==="F" || code==="H" ? "grass" : "earth";
}
