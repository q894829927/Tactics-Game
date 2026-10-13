import { type Battle } from "../engine/battle.ts";

export type LeftClickIntent = "select-ally" | "confirm-stay" | "attack" | "move" | "inspect";
export type RightClickIntent = "undo-move" | "cancel";

/** Viewing a tile is independent of the Battle's actionable ally selection. */
export function leftClickIntent(battle: Battle, x: number, y: number, attackMode: boolean): LeftClickIntent {
  const occupant = battle.occupant(x, y);
  if (occupant?.team === "ally") {
    return !attackMode && battle.selectedId === occupant.id && !occupant.spent && !occupant.moved
      ? "confirm-stay" : "select-ally";
  }
  if (occupant?.team === "enemy") return attackMode && !!battle.selected ? "attack" : "inspect";
  const ally = battle.selected;
  if (!attackMode && ally && !ally.spent && !ally.moved &&
      battle.reachable(ally).has(x + "," + y)) return "move";
  return "inspect";
}

/** Right-click is an undo/back action, never a shortcut to the action menu. */
export function rightClickIntent(battle: Battle, _x: number, _y: number): RightClickIntent {
  return battle.canCancelMove && battle.phase === "player" && battle.result === "playing"
    ? "undo-move" : "cancel";
}
