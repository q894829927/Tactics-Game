import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Unit } from "../engine/battle.ts";

const TILE = 92;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.85;
const terrainNames: Record<string, string> = { ".": "平地", F: "森林", H: "丘陵", "#": "峭壁" };
const terrainGlyphs: Record<string, string> = { ".": "", F: "♠♠", H: "▲", "#": "▥" };
const roleNames: Record<string, string> = {
  sword: "剑", lancer: "枪", archer: "弓", mage: "术", raider: "兵", commander: "将",
};

export class BoardView {
  private readonly cells: HTMLButtonElement[] = [];
  private readonly stage: HTMLDivElement;
  private readonly menu: HTMLDivElement;
  private readonly minimap: HTMLElement;
  private readonly viewportMarker: HTMLDivElement;
  private offsetX = 0;
  private offsetY = 0;
  private zoom = 1;
  private initialized = false;
  private drag: { x: number; y: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
  private suppressClick = false;
  private menuVisible = false;
  private attackMode = false;
  private previousSelection: string | null = null;
  onZoomChange: ((percent: number) => void) | null = null;
  onHint: ((message: string) => void) | null = null;

  constructor(private readonly battle: Battle, private readonly viewport: HTMLElement) {
    viewport.classList.add("map-viewport");
    const world = document.createElement("div");
    world.className = "map-world";
    world.style.width = MAP_WIDTH * TILE + "px";
    world.style.height = MAP_HEIGHT * TILE + "px";
    const grid = document.createElement("div");
    grid.className = "map-grid";
    grid.style.gridTemplateColumns = `repeat(${MAP_WIDTH}, ${TILE}px)`;
    grid.style.gridTemplateRows = `repeat(${MAP_HEIGHT}, ${TILE}px)`;
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "战棋地图");

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "battle-cell";
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.addEventListener("click", () => this.onCellClick(x, y));
        grid.appendChild(cell);
        this.cells.push(cell);
      }
    }
    world.appendChild(grid);
    this.stage = world;
    this.menu = document.createElement("div");
    this.menu.className = "unit-command-menu";
    this.menu.setAttribute("aria-label", "单位行动指令");
    this.menu.hidden = true;
    viewport.replaceChildren(world, this.menu);

    this.minimap = document.getElementById("minimap-grid")!;
    const mini = this.minimap;
    mini.style.gridTemplateColumns = `repeat(${MAP_WIDTH}, 1fr)`;
    mini.style.gridTemplateRows = `repeat(${MAP_HEIGHT}, 1fr)`;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        const t = battle.tile(x, y);
        cell.className = "mini-cell mini-" + (t === "." ? "plain" : t === "#" ? "wall" : t);
        cell.title = `${String.fromCharCode(65 + x)}${y + 1} · ${terrainNames[t]}`;
        cell.setAttribute("aria-label", "定位 " + cell.title);
        cell.addEventListener("click", () => this.centerOn(x, y));
        mini.appendChild(cell);
      }
    }
    this.viewportMarker = document.createElement("div");
    this.viewportMarker.className = "minimap-viewport";
    this.viewportMarker.setAttribute("aria-hidden", "true");
    mini.appendChild(this.viewportMarker);

    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      this.zoomAt(this.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
        event.clientX - viewport.getBoundingClientRect().left,
        event.clientY - viewport.getBoundingClientRect().top);
    }, { passive: false });
    viewport.addEventListener("pointerdown", event => this.startDrag(event));
    viewport.addEventListener("pointermove", event => this.moveDrag(event));
    viewport.addEventListener("pointerup", event => this.finishDrag(event));
    viewport.addEventListener("pointercancel", event => this.finishDrag(event));
    viewport.addEventListener("click", event => {
      if (!this.suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressClick = false;
    }, true);
    viewport.addEventListener("contextmenu", event => {
      event.preventDefault();
      this.cancelAction();
    });
    new ResizeObserver(() => {
      if (!this.initialized && viewport.clientWidth && viewport.clientHeight) {
        this.initialized = true;
        this.resetCamera();
      } else {
        this.applyCamera();
      }
    }).observe(viewport);
    this.refresh();
  }

  get zoomPercent(): number { return Math.round(this.zoom * 100); }

  zoomBy(factor: number): void {
    this.zoomAt(this.zoom * factor, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2);
  }
  resetCamera(): void {
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    if (!w || !h) return;
    // Small maps fit the window. Larger maps retain readable, fixed-size cells.
    this.zoom = Math.min(1.15, Math.max(MIN_ZOOM, Math.min(w / (MAP_WIDTH * TILE), h / (MAP_HEIGHT * TILE))));
    this.offsetX = (w - MAP_WIDTH * TILE * this.zoom) / 2;
    this.offsetY = (h - MAP_HEIGHT * TILE * this.zoom) / 2;
    this.applyCamera();
  }
  cancelAction(): boolean {
    if (this.attackMode) {
      this.attackMode = false;
      this.menuVisible = true;
      this.refresh();
      return true;
    }
    if (this.menuVisible) {
      this.menuVisible = false;
      this.refresh();
      return true;
    }
    return false;
  }
  hideCommandMenu(): void {
    this.attackMode = false;
    this.menuVisible = false;
    this.refresh();
  }
  refresh(): void {
    const selected = this.battle.selected;
    const selectedId = selected?.id ?? null;
    if (selectedId !== this.previousSelection) {
      this.attackMode = false;
      this.menuVisible = selectedId !== null && this.battle.result === "playing";
      this.previousSelection = selectedId;
    }
    const reachable = selected && !selected.moved && !selected.spent
      ? this.battle.reachable(selected) : new Map<string, number>();
    const targets = new Set(selected && !selected.acted && !selected.spent
      ? this.battle.targets(selected).map(key) : []);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = this.cells[y * MAP_WIDTH + x]!;
        const terrain = this.battle.tile(x, y);
        const actor = this.battle.occupant(x, y);
        const accessible = !actor && reachable.has(key({ x, y }));
        const targeted = this.attackMode && targets.has(key({ x, y }));
        cell.className = [
          "battle-cell", "terrain-" + (terrain === "." ? "plain" : terrain === "#" ? "wall" : terrain),
          accessible ? "can-move" : "", targeted ? "can-attack" : "",
          actor?.team === "ally" ? "has-ally" : "",
          actor?.team === "enemy" ? "has-enemy" : "",
          actor?.id === this.battle.selectedId ? "is-selected" : "",
          actor?.spent ? "is-spent" : "",
        ].filter(Boolean).join(" ");
        cell.replaceChildren();
        cell.style.setProperty("--variation", String((x * 17 + y * 31) % 7));
        const decor = document.createElement("span");
        decor.className = "terrain-symbol";
        decor.textContent = terrainGlyphs[terrain] ?? "";
        cell.appendChild(decor);
        if (actor) cell.appendChild(this.unitElement(actor));
        cell.setAttribute("aria-label", `${String.fromCharCode(65 + x)}${y + 1} ${terrainNames[terrain]} ${actor ? actor.name + " 生命 " + actor.hp + "/" + actor.maxHp : accessible ? "可移动" : targeted ? "可攻击" : ""}`);
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const el = this.minimap.children[y * MAP_WIDTH + x] as HTMLButtonElement;
        const actor = this.battle.occupant(x, y);
        el.classList.toggle("mini-ally", actor?.team === "ally");
        el.classList.toggle("mini-enemy", actor?.team === "enemy");
      }
    }
    this.renderMenu();
    this.applyCamera();
  }

  private onCellClick(x: number, y: number): void {
    if (this.battle.result !== "playing") return;
    const actor = this.battle.occupant(x, y);
    if (actor?.team === "ally") {
      this.attackMode = false;
      this.menuVisible = !actor.spent;
      this.battle.click(x, y);
      this.refresh();
      return;
    }
    if (!this.battle.selected) return;
    if (actor?.team === "enemy") {
      if (!this.attackMode) {
        this.onHint?.("请先从单位行动菜单选择「攻击」");
        return;
      }
      this.battle.click(x, y);
      this.refresh();
      return;
    }
    if (this.attackMode) {
      this.onHint?.("攻击模式：选择红色敌方单位，或右键取消");
      return;
    }
    this.battle.click(x, y);
    this.refresh();
  }

  private renderMenu(): void {
    const actor = this.battle.selected;
    this.menu.replaceChildren();
    if (!actor || !this.menuVisible || this.attackMode || actor.spent || this.battle.result !== "playing") {
      this.menu.hidden = true;
      return;
    }
    const commands = [
      { text: "攻击", icon: "⚔", enabled: !actor.acted && this.battle.targets(actor).length > 0, key: "attack" },
      { text: "道具", icon: "▣", enabled: false, key: "item" },
      { text: "术法", icon: "✦", enabled: false, key: "magic" },
      { text: "交换", icon: "⇄", enabled: false, key: "trade" },
      { text: "待机", icon: "⌛", enabled: true, key: "wait" },
    ];
    for (const cmd of commands) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-item" + (cmd.enabled && cmd.key === "attack" ? " command-primary" : "");
      button.textContent = cmd.icon + "　" + cmd.text;
      button.disabled = !cmd.enabled;
      button.title = cmd.enabled ? cmd.text : cmd.key === "attack" ? "当前射程内没有可攻击的目标，可先移动" : "后续版本开放";
      button.addEventListener("click", () => {
        if (cmd.key === "wait") {
          this.battle.waitSelected();
        } else if (cmd.key === "attack") {
          this.menuVisible = false;
          this.attackMode = true;
          this.onHint?.("攻击模式：点击红色目标，右键或 Esc 取消");
          this.refresh();
        }
      });
      this.menu.appendChild(button);
    }
    this.menu.hidden = false;
    this.positionMenu(actor);
  }

  private positionMenu(actor: Unit): void {
    const menuWidth = 150;
    const menuHeight = 218;
    let x = this.offsetX + (actor.x + 1) * TILE * this.zoom + 10;
    let y = this.offsetY + actor.y * TILE * this.zoom - 20;
    if (x + menuWidth > this.viewport.clientWidth - 10) {
      x = this.offsetX + actor.x * TILE * this.zoom - menuWidth - 10;
    }
    x = Math.max(8, Math.min(this.viewport.clientWidth - menuWidth - 8, x));
    y = Math.max(8, Math.min(this.viewport.clientHeight - menuHeight - 8, y));
    this.menu.style.left = x + "px";
    this.menu.style.top = y + "px";
  }

  private unitElement(unit: Unit): HTMLSpanElement {
    const body = document.createElement("span");
    body.className = "battle-unit";
    const emblem = document.createElement("span");
    emblem.className = "unit-emblem";
    emblem.textContent = roleNames[unit.role] ?? "兵";
    const hp = document.createElement("span");
    hp.className = "unit-health";
    const fill = document.createElement("span");
    fill.style.width = (100 * unit.hp / unit.maxHp) + "%";
    hp.appendChild(fill);
    const name = document.createElement("span");
    name.className = "unit-name";
    name.textContent = unit.name;
    body.append(emblem, hp, name);
    return body;
  }

  private startDrag(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest(".unit-command-menu")) return;
    this.drag = { x: e.clientX, y: e.clientY, offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
  }
  private moveDrag(e: PointerEvent): void {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      this.viewport.setPointerCapture(e.pointerId);
    }
    this.offsetX = this.drag.offsetX + dx;
    this.offsetY = this.drag.offsetY + dy;
    this.applyCamera();
  }
  private finishDrag(e: PointerEvent): void {
    if (!this.drag) return;
    this.suppressClick = this.drag.moved;
    this.drag = null;
    // A completed drag may not dispatch click in all browsers.
    window.setTimeout(() => { this.suppressClick = false; }, 0);
    if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
  }
  private zoomAt(value: number, px: number, py: number): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    const before = this.zoom;
    if (next === before) return;
    this.offsetX = px - (px - this.offsetX) * next / before;
    this.offsetY = py - (py - this.offsetY) * next / before;
    this.zoom = next;
    this.applyCamera();
  }
  private centerOn(x: number, y: number): void {
    this.offsetX = this.viewport.clientWidth / 2 - (x + .5) * TILE * this.zoom;
    this.offsetY = this.viewport.clientHeight / 2 - (y + .5) * TILE * this.zoom;
    this.applyCamera();
  }
  private applyCamera(): void {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!vw || !vh) return;
    const w = MAP_WIDTH * TILE * this.zoom;
    const h = MAP_HEIGHT * TILE * this.zoom;
    this.offsetX = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, this.offsetX));
    this.offsetY = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, this.offsetY));
    this.stage.style.transform = `translate3d(${this.offsetX}px,${this.offsetY}px,0) scale(${this.zoom})`;
    this.onZoomChange?.(this.zoomPercent);
    const left = Math.max(0, -this.offsetX / this.zoom / (MAP_WIDTH * TILE));
    const top = Math.max(0, -this.offsetY / this.zoom / (MAP_HEIGHT * TILE));
    const width = Math.min(1, vw / this.zoom / (MAP_WIDTH * TILE));
    const height = Math.min(1, vh / this.zoom / (MAP_HEIGHT * TILE));
    this.viewportMarker.style.left = Math.min(1 - width, left) * 100 + "%";
    this.viewportMarker.style.top = Math.min(1 - height, top) * 100 + "%";
    this.viewportMarker.style.width = width * 100 + "%";
    this.viewportMarker.style.height = height * 100 + "%";
    if (!this.menu.hidden && this.battle.selected) this.positionMenu(this.battle.selected);
  }
}
