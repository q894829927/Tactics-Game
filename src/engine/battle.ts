import { TERRAIN_INFO, type Terrain } from "./terrain.ts";
export type { Terrain } from "./terrain.ts";

export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Team = "ally" | "enemy";
export type GameResult = "playing" | "victory" | "defeat";
export type Role = "sword" | "lancer" | "archer" | "mage" | "raider" | "commander";
export type Point = { x: number; y: number };
export type AttackForecast = {
  damage: number;
  counterDamage: number;
  canCounter: boolean;
  attackerHpAfter: number;
  defenderHpAfter: number;
};

export type Unit = {
  id: string;
  name: string;
  role: Role;
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  move: number;
  minRange: number;
  maxRange: number;
  moved: boolean;
  acted: boolean;
  spent: boolean;
};

const LAYOUT = [
  "GGG...GGGG",
  ".F..H.GFGG",
  "G..##..GGG",
  "F.....H.GG",
  "GGF.GGG...",
  "G..H.GF...",
  "G....GG...",
  "....GGG...",
] as const;

function unit(id: string, name: string, role: Role, team: Team, x: number, y: number,
  maxHp: number, attack: number, defense: number, move: number, minRange = 1, maxRange = 1): Unit {
  return { id, name, role, team, x, y, hp: maxHp, maxHp, attack, defense,
    move, minRange, maxRange, moved: false, acted: false, spent: false };
}
export function key(p: Point): string { return String(p.x) + "," + String(p.y); }
export function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function inBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

export class Battle {
  readonly terrain: readonly string[] = LAYOUT;
  units: Unit[] = [];
  selectedId: string | null = null;
  round = 1;
  result: GameResult = "playing";
  log: string[] = [];
  onChange: (() => void) | null = null;
  private moveOrigin: Point | null = null;

  constructor() { this.restart(); }

  restart(): void {
    this.units = [
      unit("a1", "岚锋", "sword", "ally", 1, 5, 30, 11, 3, 3),
      unit("a2", "槿卫", "lancer", "ally", 1, 6, 36, 10, 5, 2),
      unit("a3", "霜羽", "archer", "ally", 2, 6, 24, 9, 2, 3, 2, 3),
      unit("a4", "星烬", "mage", "ally", 0, 7, 23, 12, 1, 3, 1, 2),
      unit("e1", "掠夺者 A", "raider", "enemy", 7, 1, 21, 8, 2, 3),
      unit("e2", "长枪兵", "lancer", "enemy", 8, 2, 26, 9, 4, 2),
      unit("e3", "弩手", "archer", "enemy", 7, 3, 20, 8, 2, 2, 2, 3),
      unit("e4", "掠夺者 B", "raider", "enemy", 8, 4, 21, 8, 2, 3),
      unit("e5", "掠夺者 C", "raider", "enemy", 9, 5, 21, 8, 2, 3),
      unit("e6", "赤旗统领", "commander", "enemy", 9, 7, 38, 11, 5, 2),
    ];
    this.round = 1;
    this.result = "playing";
    this.selectedId = null;
    this.moveOrigin = null;
    this.log = [];
    this.emit();
  }

  get selected(): Unit | undefined {
    return this.units.find(u => u.id === this.selectedId && u.hp > 0);
  }
  get canCancelMove(): boolean {
    const selected = this.selected;
    return !!(selected && selected.team === "ally" && selected.moved &&
      !selected.acted && !selected.spent && this.moveOrigin);
  }

  cancelMove(): boolean {
    if (!this.canCancelMove || !this.moveOrigin) return false;
    const actor = this.selected!;
    if (this.occupant(this.moveOrigin.x, this.moveOrigin.y)) return false;
    actor.x = this.moveOrigin.x;
    actor.y = this.moveOrigin.y;
    actor.moved = false;
    this.moveOrigin = null;
    this.emit();
    return true;
  }

  /** Pure prediction: uses the exact damage and retaliation rules of the battle engine. */
  forecastAttack(attacker: Unit, defender: Unit): AttackForecast | null {
    if (this.result !== "playing" || attacker.hp <= 0 || defender.hp <= 0 ||
        attacker.team === defender.team || attacker.spent || attacker.acted ||
        !this.inAttackRange(attacker, defender)) return null;
    const damage = this.damage(attacker, defender);
    const defenderHpAfter = Math.max(0, defender.hp - damage);
    const canCounter = defenderHpAfter > 0 && this.inAttackRange(defender, attacker);
    const counterDamage = canCounter ? this.damage(defender, attacker) : 0;
    return {damage, counterDamage, canCounter,
      attackerHpAfter: Math.max(0, attacker.hp - counterDamage), defenderHpAfter};
  }

  private completedMovement(actor: Unit): string {
    return this.moveOrigin
      ? "移动至 (" + actor.x + ", " + actor.y + ") 后" : "";
  }

  private committedLog(action: string): void {
    this.logLine("第 " + this.round + " 回合 · " + action);
  }

  alive(team: Team): Unit[] {
    return this.units.filter(u => u.hp > 0 && u.team === team);
  }
  occupant(x: number, y: number): Unit | undefined {
    return this.units.find(u => u.hp > 0 && u.x === x && u.y === y);
  }
  tile(x: number, y: number): Terrain {
    if (!inBounds(x, y)) return "#";
    return this.terrain[y]![x] as Terrain;
  }

  // Dijkstra, not naive Manhattan radius: terrain costs and occupied tiles matter.
  reachable(actor: Unit): Map<string, number> {
    const best = new Map<string, number>();
    if (actor.hp <= 0) return best;
    const start = key(actor);
    best.set(start, 0);
    const queue: Array<{ x: number; y: number; cost: number }> =
      [{ x: actor.x, y: actor.y, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (current.cost !== best.get(key(current))) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = current.x + dx!, y = current.y + dy!;
        if (!inBounds(x, y) || this.occupant(x, y)) continue;
        const cost = current.cost + TERRAIN_INFO[this.tile(x, y)].moveCost;
        if (cost > actor.move || cost >= (best.get(key({ x, y })) ?? Infinity)) continue;
        best.set(key({ x, y }), cost);
        queue.push({ x, y, cost });
      }
    }
    return best;
  }

  inAttackRange(attacker: Unit, defender: Unit): boolean {
    const d = distance(attacker, defender);
    return d >= attacker.minRange && d <= attacker.maxRange;
  }
  targets(actor: Unit): Unit[] {
    return this.alive(actor.team === "ally" ? "enemy" : "ally")
      .filter(u => this.inAttackRange(actor, u));
  }
  damage(attacker: Unit, defender: Unit): number {
    return Math.max(1, attacker.attack - defender.defense -
      TERRAIN_INFO[this.tile(defender.x, defender.y)].defense);
  }

  click(x: number, y: number): void {
    if (this.result !== "playing" || !inBounds(x, y)) return;
    const found = this.occupant(x, y);
    if (found?.team === "ally") {
      if (!found.spent) {
        // Do not leave a different ally's tentative move stranded.
        if (this.selectedId !== found.id && this.canCancelMove) this.cancelMove();
        this.selectedId = found.id;
        this.emit();
      }
      return;
    }
    const actor = this.selected;
    if (!actor || actor.spent) return;
    if (found?.team === "enemy") {
      const forecast = this.forecastAttack(actor, found);
      if (!forecast) return;
      const moved = this.completedMovement(actor);
      const result = this.strike(actor, found);
      const hit = actor.name + (moved ? " " + moved : "") +
        "攻击 " + found.name + "：造成 " + result.damage + " 点伤害";
      const retaliation = result.counterDamage > 0 ? "；" + found.name + "反击造成 " +
        result.counterDamage + " 点伤害" : "";
      this.committedLog(hit + retaliation +
        (result.defenderFell ? "；目标被击败" : "") +
        (result.attackerFell ? "；攻击者被击败" : ""));
      actor.acted = true;
      actor.spent = true;
      this.moveOrigin = null;
      this.selectedId = null;
      this.resolve();
      this.emit();
      return;
    }
    if (actor.moved) return;
    if (!this.reachable(actor).has(key({ x, y }))) return;
    this.moveOrigin = {x: actor.x, y: actor.y};
    actor.x = x;
    actor.y = y;
    actor.moved = true;
    // A tentative move is NOT a completed action and must not enter the log.
    this.emit();
  }

  waitSelected(): void {
    if (this.result !== "playing") return;
    const actor = this.selected;
    if (!actor || actor.team !== "ally" || actor.spent) return;
    this.committedLog(actor.name + " " + this.completedMovement(actor) + "待机");
    actor.spent = true;
    actor.acted = true;
    this.moveOrigin = null;
    this.selectedId = null;
    this.emit();
  }

  endTurn(): void {
    if (this.result !== "playing") return;
    this.selectedId = null;
    this.moveOrigin = null;
    this.alive("ally").forEach(u => { u.spent = true; });
    for (const enemy of this.alive("enemy")) {
      if (this.result !== "playing") break;
      this.enemyAct(enemy);
      this.resolve();
    }
    if (this.result === "playing") {
      this.round++;
      for (const u of this.alive("ally")) {
        u.moved = false;
        u.acted = false;
        u.spent = false;
      }
      // No standalone turn or selection entries: the log records complete actions only.
    }
    this.emit();
  }

  private enemyAct(enemy: Unit): void {
    const foes = this.alive("ally");
    if (!foes.length) return;
    const before = {x: enemy.x, y: enemy.y};
    let target = this.nearest(enemy, foes);
    if (!this.inAttackRange(enemy, target)) {
      const places = [...this.reachable(enemy).keys()];
      let best = {x: enemy.x, y: enemy.y};
      let bestScore = this.approachScore(enemy, target);
      for (const p of places) {
        const [x, y] = p.split(",").map(Number);
        const choice = {x: x!, y: y!};
        const score = this.approachScore(choice, target);
        if (score < bestScore) {best = choice; bestScore = score;}
      }
      enemy.x = best.x; enemy.y = best.y;
    }
    const moved = before.x !== enemy.x || before.y !== enemy.y
      ? " 移动至 (" + enemy.x + ", " + enemy.y + ") 后" : " ";
    const attackable = this.targets(enemy);
    if (attackable.length) {
      target = [...attackable].sort((a, b) =>
        (this.damage(enemy, b) >= b.hp ? 1 : 0) -
        (this.damage(enemy, a) >= a.hp ? 1 : 0) || a.hp - b.hp)[0]!;
      const result = this.strike(enemy, target);
      this.committedLog(enemy.name + moved + "攻击 " + target.name + "：造成 " +
        result.damage + " 点伤害" +
        (result.counterDamage ? "；" + target.name + "反击造成 " + result.counterDamage + " 点伤害" : "") +
        (result.defenderFell ? "；目标被击败" : "") +
        (result.attackerFell ? "；攻击者被击败" : ""));
    } else {
      this.committedLog(enemy.name + (before.x !== enemy.x || before.y !== enemy.y
        ? " 移动至 (" + enemy.x + ", " + enemy.y + ")" : " 待机"));
    }
  }
  private approachScore(from: Point, target: Unit): number {
    const d = distance(from, target);
    return d > target.maxRange ? d : Math.max(0, d - 1) * 2;
  }
  private nearest(from: Point, candidates: Unit[]): Unit {
    return [...candidates].sort((a, b) => distance(from, a) - distance(from, b))[0]!;
  }
  private strike(actor: Unit, defender: Unit): {
    damage: number; counterDamage: number; defenderFell: boolean; attackerFell: boolean;
  } {
    const forecast = this.forecastAttack(actor, defender);
    if (!forecast) return {damage: 0, counterDamage: 0, defenderFell: false, attackerFell: false};
    defender.hp = forecast.defenderHpAfter;
    if (forecast.canCounter) actor.hp = forecast.attackerHpAfter;
    return {damage: forecast.damage, counterDamage: forecast.counterDamage,
      defenderFell: defender.hp <= 0, attackerFell: actor.hp <= 0};
  }
  private resolve(): void {
    if (!this.alive("ally").length) {
      this.result = "defeat";
    } else if (!this.units.some(u => u.id === "e6" && u.hp > 0)) {
      this.result = "victory";
    }
    if (this.result !== "playing") {
      this.selectedId = null;
      this.moveOrigin = null;
    }
  }
  private logLine(line: string): void {
    this.log.push(line);
    if (this.log.length > 12) this.log.shift();
  }
  private emit(): void { this.onChange?.(); }
}
