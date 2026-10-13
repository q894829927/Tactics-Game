import { type Battle } from "../engine/battle.ts";

export type LeftClickIntent = "select-ally" | "attack" | "move" | "inspect";
export type RightClickIntent = "open-menu" | "inspect";

/** Viewing a tile is independent of the Battle's actionable ally selection. */
export function leftClickIntent(battle: Battle, x: number, y: number, attackMode: boolean): LeftClickIntent {
  const occupant = battle.occupant(x, y);
  if (occupant?.team === "ally") return "select-ally";
  if (occupant?.team === "enemy") return attackMode && !!battle.selected ? "attack" : "inspect";
  const ally = battle.selected;
  if (!attackMode && ally && !ally.spent && !ally.moved &&
      battle.reachable(ally).has(x + "," + y)) return "move";
  return "inspect";
}

/** A right-click never attacks or moves a unit; only actionable allies have menus. */
export function rightClickIntent(battle: Battle, x: number, y: number): RightClickIntent {
  const occupant = battle.occupant(x, y);
  return battle.result === "playing" && occupant?.team === "ally" && !occupant.spent
    ? "open-menu" : "inspect";
}
