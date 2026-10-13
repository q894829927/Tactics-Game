import { TERRAIN_INFO, type Terrain } from "./terrain.ts";
import {createCharacter,deriveCombat,awardExperience,clampChance,
  type CharacterData,type CombatStats} from "./attributes.ts";
export type { Terrain } from "./terrain.ts";

export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Team = "ally" | "enemy";
export type GameResult = "playing" | "victory" | "defeat";
export type Role = "sword" | "lancer" | "archer" | "mage" | "raider" | "commander";
export type Point = { x: number; y: number };
/** Read-only movement plus potential attack preview for one enemy. */
/** Single enemy action plan, created before animation and committed afterwards. */
export type EnemyActionPlan = {
  unitId: string;
  destination: Point;
  path: Point[];
  targetId: string | null;
};

export type EnemyThreat = {
  move: Set<string>;
  attack: Set<string>;
};

export type AttackForecast = {
  damage:number; counterDamage:number; canCounter:boolean;
  attackerHpAfter:number; defenderHpAfter:number;
  attackerHit:number; defenderHit:number; attackerCrit:number; defenderCrit:number;
  followUp:"attacker"|"defender"|null;
};

export type Unit = CharacterData & {
  id:string;name:string;role:Role;team:Team;x:number;y:number;
  minRange:number;maxRange:number;
  moved:boolean;acted:boolean;spent:boolean;
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

function unit(id:string,name:string,role:Role,team:Team,x:number,y:number,
  maxHp:number,attack:number,defense:number,move:number,minRange=1,maxRange=1):Unit {
  return {id,name,role,team,x,y,
    ...createCharacter(role,maxHp,attack,defense,move,minRange,maxRange),
    minRange,maxRange,moved:false,acted:false,spent:false};
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
  phase: "player" | "enemy" = "player";
  result: GameResult = "playing";
  log: string[] = [];
  onChange: (() => void) | null = null;
  private moveOrigin: Point | null = null;
  private enemyQueue: string[] = [];
  private randomState=0x2946e73b;
  setRandomSeed(seed:number):void {this.randomState=(seed>>>0)||1;}
  private nextRandom():number {
    let x=this.randomState;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    this.randomState=x>>>0;
    return this.randomState/4294967296;
  }
  private roll(chance:number):boolean {
    return chance>=100?true:chance<=0?false:this.nextRandom()*100<chance;
  }

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
    this.phase = "player";
    this.enemyQueue = [];
    this.result = "playing";
    this.setRandomSeed(0x2946e73b);
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
    if (this.phase !== "player" || !this.canCancelMove || !this.moveOrigin) return false;
    const actor = this.selected!;
    if (this.occupant(this.moveOrigin.x, this.moveOrigin.y)) return false;
    actor.x = this.moveOrigin.x;
    actor.y = this.moveOrigin.y;
    actor.moved = false;
    this.moveOrigin = null;
    this.emit();
    return true;
  }

  combatStats(unit:Unit):CombatStats {
    return deriveCombat(unit,TERRAIN_INFO[this.tile(unit.x,unit.y)].defense);
  }
  hitChance(from:Unit,to:Unit):number {
    return clampChance(this.combatStats(from).hit-this.combatStats(to).avoid);
  }
  criticalChance(from:Unit,to:Unit):number {
    return clampChance(this.combatStats(from).crit-this.combatStats(to).critAvoid);
  }
  /** Pure forecast: normal hits land, no criticals. Actual combat uses seeded RNG. */
  forecastAttack(attacker:Unit,defender:Unit):AttackForecast|null {
    if(this.result!=="playing"||attacker.hp<=0||defender.hp<=0||
      attacker.team===defender.team||attacker.spent||attacker.acted||
      !this.inAttackRange(attacker,defender))return null;
    const damage=this.damage(attacker,defender);
    const counterDamage=this.damage(defender,attacker);
    const counterInRange=this.inAttackRange(defender,attacker);
    const diff=this.combatStats(attacker).attackSpeed-this.combatStats(defender).attackSpeed;
    const followUp=diff>=5?"attacker":diff<=-5?"defender":null;
    let hpA=attacker.hp,hpD=Math.max(0,defender.hp-damage);
    const canCounter=counterInRange&&hpD>0;
    if(canCounter)hpA=Math.max(0,hpA-counterDamage);
    if(hpA>0&&hpD>0){
      if(followUp==="attacker")hpD=Math.max(0,hpD-damage);
      else if(followUp==="defender"&&counterInRange)hpA=Math.max(0,hpA-counterDamage);
    }
    return {damage,counterDamage,canCounter,attackerHpAfter:hpA,defenderHpAfter:hpD,
      attackerHit:this.hitChance(attacker,defender),defenderHit:this.hitChance(defender,attacker),
      attackerCrit:this.criticalChance(attacker,defender),
      defenderCrit:this.criticalChance(defender,attacker),followUp};
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

  /**
   * Computes legal movement endpoints and all tiles attackable from those endpoints.
   * Uses the same weighted reachable() algorithm as the enemy AI, the same
   * Manhattan min/max range as inAttackRange, and never changes the battle.
   */
  enemyThreat(enemy: Unit): EnemyThreat {
    const move = new Set<string>();
    const attack = new Set<string>();
    if (this.result !== "playing" || enemy.team !== "enemy" || enemy.hp <= 0) {
      return {move, attack};
    }
    for (const position of this.reachable(enemy).keys()) {
      move.add(position); // Includes standing still / a stationary attack.
      const [px, py] = position.split(",").map(Number);
      for (let dy = -enemy.maxRange; dy <= enemy.maxRange; dy++) {
        for (let dx = -enemy.maxRange; dx <= enemy.maxRange; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < enemy.minRange || d > enemy.maxRange) continue;
          const x = px! + dx;
          const y = py! + dy;
          if (!inBounds(x, y) || this.tile(x, y) === "#") continue;
          if (this.occupant(x, y)?.team === enemy.team) continue;
          attack.add(key({x, y}));
        }
      }
    }
    return {move, attack};
  }

  /** Returns a minimum movement-cost path, including origin and destination.
   * Uses the exact reachable() terrain weights and occupancy; no state mutation.
   */
  movementPath(actor: Unit, destination: Point): Point[] | null {
    if (!inBounds(destination.x, destination.y)) return null;
    const costs = this.reachable(actor);
    if (!costs.has(key(destination))) return null;
    const path: Point[] = [{x: destination.x, y: destination.y}];
    let current = path[0]!;
    while (current.x !== actor.x || current.y !== actor.y) {
      const cost = costs.get(key(current))!;
      const entering = TERRAIN_INFO[this.tile(current.x, current.y)].moveCost;
      const previous = [
        {x: current.x - 1, y: current.y},
        {x: current.x, y: current.y - 1},
        {x: current.x + 1, y: current.y},
        {x: current.x, y: current.y + 1},
      ].find(p => costs.get(key(p)) === cost - entering);
      if (!previous) return null;
      path.push(previous);
      current = previous;
    }
    return path.reverse();
  }

  inAttackRange(attacker: Unit, defender: Unit): boolean {
    const d = distance(attacker, defender);
    return d >= attacker.minRange && d <= attacker.maxRange;
  }
  targets(actor: Unit): Unit[] {
    return this.alive(actor.team === "ally" ? "enemy" : "ally")
      .filter(u => this.inAttackRange(actor, u));
  }
  damage(attacker:Unit,defender:Unit):number {
    const from=this.combatStats(attacker),to=this.combatStats(defender);
    return Math.max(0,attacker.weapon.kind==="magical"
      ? from.magicalAttack-to.magicalProtection
      : from.physicalAttack-to.physicalProtection);
  }

  click(x: number, y: number): void {
    if (this.phase !== "player" || this.result !== "playing" || !inBounds(x, y)) return;
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
        (result.attackerFell ? "；攻击者被击败" : "") + result.detail);
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
    if (this.phase !== "player" || this.result !== "playing") return;
    const actor = this.selected;
    if (!actor || actor.team !== "ally" || actor.spent) return;
    this.committedLog(actor.name + " " + this.completedMovement(actor) + "待机");
    actor.spent = true;
    actor.acted = true;
    this.moveOrigin = null;
    this.selectedId = null;
    this.emit();
  }

  /** Player-facing legacy entry point: runs the same sequential API without delays.
   * Browser uses begin/plan/commit/finish for one-by-one presentation.
   */
  endTurn(): void {
    if (!this.beginEnemyTurn()) return;
    while (this.result === "playing") {
      const plan = this.planEnemyAction();
      if (!plan) break;
      this.commitEnemyAction(plan);
    }
    this.finishEnemyTurn();
  }

  beginEnemyTurn(): boolean {
    if (this.phase !== "player" || this.result !== "playing") return false;
    // Resolve pre-existing terminal states (e.g. the final ally already at 0 HP).
    this.resolve();
    if (this.result !== "playing") {
      this.emit();
      return false;
    }
    this.phase = "enemy";
    this.selectedId = null;
    this.moveOrigin = null;
    this.alive("ally").forEach(u => { u.spent = true; });
    this.enemyQueue = this.alive("enemy").map(u => u.id);
    this.emit();
    return true;
  }

  /** Does not move, attack, log or alter the pending queue. */
  planEnemyAction(): EnemyActionPlan | null {
    if (this.phase !== "enemy" || this.result !== "playing") return null;
    const id = this.enemyQueue[0];
    if (!id) return null;
    const enemy = this.units.find(u => u.id === id && u.hp > 0);
    if (!enemy) return null; // Queue is static; currently dead enemies cannot be acted.
    const foes = this.alive("ally");
    if (!foes.length) return null;
    const nearest = this.nearest(enemy, foes);
    let destination = {x: enemy.x, y: enemy.y};
    if (!this.inAttackRange(enemy, nearest)) {
      let best = this.approachScore(enemy, nearest);
      for (const position of this.reachable(enemy).keys()) {
        const [x, y] = position.split(",").map(Number);
        const candidate = {x: x!, y: y!};
        const score = this.approachScore(candidate, nearest);
        if (score < best) { destination = candidate; best = score; }
      }
    }
    const future = {...enemy, x: destination.x, y: destination.y};
    const attackable = foes.filter(u => this.inAttackRange(future, u));
    const target = [...attackable].sort((a, b) =>
      (this.damage(enemy, b) >= b.hp ? 1 : 0) -
      (this.damage(enemy, a) >= a.hp ? 1 : 0) || a.hp - b.hp)[0];
    return {unitId: enemy.id, destination,
      path: this.movementPath(enemy, destination) ?? [{x:enemy.x,y:enemy.y}],
      targetId: target?.id ?? null};
  }

  /** Commits exactly one enemy's completed action and emits a single state change. */
  commitEnemyAction(plan: EnemyActionPlan): boolean {
    if (this.phase !== "enemy" || this.result !== "playing" ||
        this.enemyQueue[0] !== plan.unitId) return false;
    const enemy = this.units.find(u => u.id === plan.unitId && u.hp > 0);
    if (!enemy || !this.movementPath(enemy, plan.destination)) return false;
    const start = {x: enemy.x, y: enemy.y};
    enemy.x = plan.destination.x;
    enemy.y = plan.destination.y;
    const moved = start.x !== enemy.x || start.y !== enemy.y;
    const prefix = enemy.name + (moved
      ? " 移动至 (" + enemy.x + ", " + enemy.y + ") 后" : " ");
    const target = this.units.find(u => u.id === plan.targetId && u.hp > 0);
    if (target && this.inAttackRange(enemy, target)) {
      const result = this.strike(enemy, target);
      this.committedLog(prefix + "攻击 " + target.name + "：造成 " +
        result.damage + " 点伤害" +
        (result.counterDamage ? "；" + target.name + "反击造成 " + result.counterDamage + " 点伤害" : "") +
        (result.defenderFell ? "；目标被击败" : "") +
        (result.attackerFell ? "；攻击者被击败" : "") + result.detail);
    } else {
      this.committedLog(enemy.name + (moved
        ? " 移动至 (" + enemy.x + ", " + enemy.y + ")" : " 待机"));
    }
    enemy.spent = true;
    this.enemyQueue.shift();
    this.resolve();
    this.emit();
    return true;
  }

  finishEnemyTurn(): boolean {
    if (this.phase !== "enemy" || this.enemyQueue.length !== 0) return false;
    this.enemyQueue = [];
    this.phase = "player";
    if (this.result === "playing") {
      this.round++;
      for (const unit of this.alive("ally")) {
        unit.moved = false; unit.acted = false; unit.spent = false;
      }
      for (const unit of this.alive("enemy")) {
        unit.moved = false; unit.acted = false; unit.spent = false;
      }
    }
    this.emit();
    return true;
  }

  private approachScore(from: Point, target: Unit): number {
    const d = distance(from, target);
    return d > target.maxRange ? d : Math.max(0, d - 1) * 2;
  }
  private nearest(from: Point, candidates: Unit[]): Unit {
    return [...candidates].sort((a, b) => distance(from, a) - distance(from, b))[0]!;
  }
  private strike(actor:Unit,defender:Unit):{
    damage:number;counterDamage:number;defenderFell:boolean;attackerFell:boolean;detail:string;
  } {
    const forecast=this.forecastAttack(actor,defender);
    if(!forecast)return {damage:0,counterDamage:0,defenderFell:false,attackerFell:false,detail:""};
    let damage=0,counterDamage=0,misses=0,crits=0,countered=false;
    const hit=(from:Unit,to:Unit):number=>{
      if(from.hp<=0||to.hp<=0)return 0;
      if(!this.roll(this.hitChance(from,to))){misses++;return 0;}
      const critical=this.roll(this.criticalChance(from,to));
      if(critical)crits++;
      const amount=this.damage(from,to)*(critical?3:1);
      to.hp=Math.max(0,to.hp-amount);
      return amount;
    };
    damage+=hit(actor,defender);
    if(defender.hp>0&&actor.hp>0&&this.inAttackRange(defender,actor)){
      countered=true;counterDamage+=hit(defender,actor);
    }
    if(actor.hp>0&&defender.hp>0){
      if(forecast.followUp==="attacker")damage+=hit(actor,defender);
      else if(forecast.followUp==="defender"&&this.inAttackRange(defender,actor)){
        countered=true;counterDamage+=hit(defender,actor);
      }
    }
    let levelNote="";
    if(actor.team==="ally"&&actor.hp>0){
      if(awardExperience(actor,10+(defender.hp===0?25:0),()=>this.nextRandom()))
        levelNote+="；"+actor.name+" Lv."+actor.level;
    }
    if(defender.team==="ally"&&defender.hp>0&&countered){
      if(awardExperience(defender,10,()=>this.nextRandom()))
        levelNote+="；"+defender.name+" Lv."+defender.level;
    }
    return {damage,counterDamage,defenderFell:defender.hp<=0,attackerFell:actor.hp<=0,
      detail:(misses?"；未命中 "+misses+" 次":"")+(crits?"；必杀 "+crits+" 次":"")+levelNote};
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
      // No additional enemy actions occur once the battle is over.
      this.enemyQueue = [];
    }
  }
  private logLine(line: string): void {
    this.log.push(line);
    if (this.log.length > 12) this.log.shift();
  }
  private emit(): void { this.onChange?.(); }
}
