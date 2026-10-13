import type { Battle, Point } from "../engine/battle.ts";

/**
 * A tile inspection is fixed in world space; a unit inspection follows the
 * unit's stable ID across movement, attacks and turn transitions.
 */
export class InspectionState {
  private point: Point | null = null;
  private unitId: string | null = null;

  private readonly battle: Battle;

  constructor(battle: Battle) {
    this.battle = battle;
  }

  inspect(x: number, y: number): void {
    this.point = {x, y};
    this.unitId = this.battle.occupant(x, y)?.id ?? null;
  }

  get cell(): Point | null {
    if (!this.unitId) return this.point;
    const unit = this.battle.units.find(u => u.id === this.unitId && u.hp > 0);
    return unit ? {x: unit.x, y: unit.y} : null;
  }

  get selectedUnitId(): string | null { return this.unitId; }

  clear(): void {
    this.point = null;
    this.unitId = null;
  }
}
