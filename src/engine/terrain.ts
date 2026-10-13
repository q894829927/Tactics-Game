export type Terrain = "." | "G" | "F" | "H" | "#";

/** Shared by pathfinding, damage calculation and both terrain information UIs. */
export const TERRAIN_INFO: Record<Terrain, {
  name: string; icon: string; moveCost: number; defense: number;
}> = {
  ".": {name:"土地", icon:"◇", moveCost:1, defense:0},
  G: {name:"草地", icon:"♧", moveCost:2, defense:0},
  F: {name:"森林", icon:"♠", moveCost:2, defense:1},
  H: {name:"丘陵", icon:"▲", moveCost:2, defense:1},
  "#": {name:"峭壁", icon:"▥", moveCost:Infinity, defense:0},
};

export function movementCostLabel(terrain: Terrain): string {
  const cost = TERRAIN_INFO[terrain].moveCost;
  return Number.isFinite(cost) ? String(cost) : "不可通行";
}
