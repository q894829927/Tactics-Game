import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Unit } from "../engine/battle.ts";

const terrainNames: Record<string, string> = { ".": "", F: "林", H: "丘", "#": "峭壁" };
const roleNames: Record<string, string> = {
  sword: "剑", lancer: "枪", archer: "弓", mage: "术", raider: "兵", commander: "将",
};

/**
 * Native DOM battle view. Text remains browser-rendered at every viewport size:
 * no text textures, Phaser FIT scaling, or bitmap interpolation.
 */
export class BoardView {
  private readonly root: HTMLElement;
  private readonly cells: HTMLButtonElement[] = [];
  private readonly result: HTMLDivElement;
  constructor(private readonly battle: Battle, root: HTMLElement) {
    this.root = root;
    root.classList.add("battle-view");
    const heading = document.createElement("div");
    heading.className = "battle-heading";
    heading.textContent = "THE RED BANNER · BORDER OUTPOST";
    const grid = document.createElement("div");
    grid.className = "battle-grid";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "十列八行战棋地图");
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "battle-cell";
        cell.addEventListener("click", () => this.battle.click(x, y));
        grid.appendChild(cell);
        this.cells.push(cell);
      }
    }
    const foot = document.createElement("div");
    foot.className = "battle-instructions";
    const hint = document.createElement("span");
    hint.textContent = "选择友军 → 移动 / 点击红方攻击 → 待机 / 结束回合";
    const size = document.createElement("span");
    size.textContent = "10 × 8";
    foot.append(hint, size);
    this.result = document.createElement("div");
    this.result.className = "battle-overlay";
    this.result.setAttribute("role", "status");
    this.result.hidden = true;
    root.replaceChildren(heading, grid, foot, this.result);
    this.refresh();
  }
  refresh(): void {
    const selected = this.battle.selected;
    const reachable = selected && !selected.moved && !selected.spent
      ? this.battle.reachable(selected) : new Map<string, number>();
    const targets = new Set(selected && !selected.spent
      ? this.battle.targets(selected).map(key) : []);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = this.cells[y * MAP_WIDTH + x]!;
        const terrain = this.battle.tile(x, y);
        const actor = this.battle.occupant(x, y);
        const accessible = !actor && reachable.has(key({ x, y }));
        const target = targets.has(key({ x, y }));
        cell.className = [
          "battle-cell", "terrain-" + (terrain === "." ? "plain" : terrain === "#" ? "wall" : terrain),
          accessible ? "can-move" : "", target ? "can-attack" : "",
          actor?.team === "ally" ? "has-ally" : "",
          actor?.team === "enemy" ? "has-enemy" : "",
          actor?.id === this.battle.selectedId ? "is-selected" : "",
          actor?.spent ? "is-spent" : "",
        ].filter(Boolean).join(" ");
        cell.replaceChildren();
        const terrainLabel = document.createElement("span");
        terrainLabel.className = "terrain-label";
        terrainLabel.textContent = terrainNames[terrain] ?? "";
        cell.appendChild(terrainLabel);
        if (actor) cell.appendChild(this.unitElement(actor));
        cell.setAttribute("aria-label", `第${y + 1}行第${x + 1}列 ${terrainNames[terrain] || "平地"} ${actor ? actor.name + "，生命" + actor.hp + "/" + actor.maxHp : accessible ? "可移动" : target ? "可攻击" : ""}`);
      }
    }
    this.result.hidden = this.battle.result === "playing";
    this.result.textContent = this.battle.result === "victory"
      ? "关卡胜利 · 使用右侧按钮重新开始关卡"
      : this.battle.result === "defeat"
        ? "挑战失败 · 使用右侧按钮重新开始关卡" : "";
  }
  private unitElement(unit: Unit): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = "battle-unit";
    const emblem = document.createElement("span");
    emblem.className = "unit-emblem";
    emblem.textContent = roleNames[unit.role] ?? "兵";
    const hp = document.createElement("span");
    hp.className = "unit-health";
    const hpFill = document.createElement("span");
    hpFill.style.width = (100 * unit.hp / unit.maxHp) + "%";
    hp.appendChild(hpFill);
    const name = document.createElement("span");
    name.className = "unit-name";
    name.textContent = unit.name;
    body.append(emblem, hp, name);
    return body;
  }
}
