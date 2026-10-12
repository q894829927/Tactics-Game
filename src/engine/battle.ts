export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Team = "ally" | "enemy";
export type Terrain = "." | "F" | "H" | "#";
export type GameResult = "playing" | "victory" | "defeat";
export type Role = "sword" | "lancer" | "archer" | "mage" | "raider" | "commander";
export type Point = { x: number; y: number };
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
  "..........",
  ".F..H..F..",
  "...##.....",
  "F.....H...",
  "..F.......",
  "...H..F...",
  "..........",
  "..........",
] as const;
const terrainCost: Record<Terrain, number> = { ".": 1, F: 2, H: 2, "#": Infinity };
const terrainDefense: Record<Terrain, number> = { ".": 0, F: 1, H: 1, "#": 0 };

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
    this.log = ["目标：击败敌军统领。点击蓝方单位，然后移动或攻击。"];
    this.emit();
  }

  get selected(): Unit | undefined {
    return this.units.find(u => u.id === this.selectedId && u.hp > 0);
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
        const cost = current.cost + terrainCost[this.tile(x, y)];
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
      terrainDefense[this.tile(defender.x, defender.y)]);
  }

  click(x: number, y: number): void {
    if (this.result !== "playing" || !inBounds(x, y)) return;
    const found = this.occupant(x, y);
    if (found?.team === "ally") {
      if (!found.spent) {
        this.selectedId = found.id;
        this.note("选择了 " + found.name + (found.moved ? "，等待行动" : "，可移动或攻击"));
      } else this.note(found.name + " 已结束本回合行动");
      return;
    }
    const actor = this.selected;
    if (!actor || actor.spent) return;
    if (found?.team === "enemy") {
      if (actor.acted || !this.inAttackRange(actor, found)) {
        this.note("目标不在攻击范围内");
        return;
      }
      this.strike(actor, found);
      actor.acted = true;
      actor.spent = true;
      this.selectedId = null;
      this.resolve();
      this.emit();
      return;
    }
    if (actor.moved) { this.note("本回合已移动，请攻击或待机"); return; }
    if (!this.reachable(actor).has(key({ x, y }))) {
      this.note("无法到达该格子");
      return;
    }
    actor.x = x; actor.y = y; actor.moved = true;
    this.note(actor.name + " 移动至 (" + x + ", " + y + ")");
  }

  waitSelected(): void {
    if (this.result !== "playing") return;
    const u = this.selected;
    if (!u || u.team !== "ally") return;
    u.spent = true;
    u.acted = true;
    this.selectedId = null;
    this.note(u.name + " 待机");
  }

  endTurn(): void {
    if (this.result !== "playing") return;
    this.selectedId = null;
    this.alive("ally").forEach(u => { u.spent = true; });
    this.logLine("— 第 " + this.round + " 回合：敌方行动 —");
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
      this.logLine("— 第 " + this.round + " 回合：我方行动 —");
    }
    this.emit();
  }

  private enemyAct(enemy: Unit): void {
    const foes = this.alive("ally");
    if (!foes.length) return;
    let target = this.nearest(enemy, foes);
    if (!this.inAttackRange(enemy, target)) {
      const places = [...this.reachable(enemy).keys()];
      let best = { x: enemy.x, y: enemy.y };
      let bestScore = this.approachScore(enemy, target);
      for (const p of places) {
        const [x, y] = p.split(",").map(Number);
        const choice = { x: x!, y: y! };
        const score = this.approachScore(choice, target);
        if (score < bestScore) { best = choice; bestScore = score; }
      }
      enemy.x = best.x; enemy.y = best.y;
    }
    const attackable = this.targets(enemy);
    if (attackable.length) {
      target = [...attackable].sort((a, b) =>
        (this.damage(enemy, b) >= b.hp ? 1 : 0) -
        (this.damage(enemy, a) >= a.hp ? 1 : 0) || a.hp - b.hp)[0]!;
      this.strike(enemy, target);
    } else {
      this.logLine(enemy.name + " 正在逼近");
    }
  }
  private approachScore(from: Point, target: Unit): number {
    const d = distance(from, target);
    return d > target.maxRange ? d : Math.max(0, d - 1) * 2;
  }
  private nearest(from: Point, candidates: Unit[]): Unit {
    return [...candidates].sort((a, b) => distance(from, a) - distance(from, b))[0]!;
  }
  private strike(actor: Unit, defender: Unit): void {
    const first = this.damage(actor, defender);
    defender.hp = Math.max(0, defender.hp - first);
    this.logLine(actor.name + " → " + defender.name + "：" + first + " 伤害");
    if (defender.hp <= 0) {
      this.logLine(defender.name + " 被击败");
      return;
    }
    if (this.inAttackRange(defender, actor)) {
      const counter = this.damage(defender, actor);
      actor.hp = Math.max(0, actor.hp - counter);
      this.logLine(defender.name + " 反击：" + counter + " 伤害");
      if (actor.hp <= 0) this.logLine(actor.name + " 被击败");
    }
  }
  private resolve(): void {
    if (!this.alive("ally").length) {
      this.result = "defeat";
      this.logLine("全军覆没。挑战失败。");
    } else if (!this.units.some(u => u.id === "e6" && u.hp > 0)) {
      this.result = "victory";
      this.logLine("敌军统领被击败。任务完成！");
    }
    if (this.result !== "playing") this.selectedId = null;
  }
  private logLine(line: string): void {
    this.log.push(line);
    if (this.log.length > 12) this.log.shift();
  }
  private note(line: string): void { this.logLine(line); this.emit(); }
  private emit(): void { this.onChange?.(); }
}
