import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Unit } from "../engine/battle.ts";
import { clampCameraOffset } from "./cameraBounds.ts";
import {
  TILE, WORLD_COLS, WORLD_ROWS, WORLD_WIDTH, WORLD_HEIGHT, TACTICAL_X, TACTICAL_Y,
  MIN_ZOOM, MAX_ZOOM, tileWorld, minimapFrame, screenTile,
} from "./worldGeometry.ts";

// The A2-2 vertical slice consists of original, reusable SVG assets in public/.
// Respect Vite's sub-directory base (/games/tactics/) rather than absolute /assets paths.
const sceneAsset = (name: string): string => import.meta.env.BASE_URL + "assets/maps/red-banner/" + name;
const imgAsset = (name: string, x: number, y: number, w: number, h: number, opacity=1): HTMLImageElement => {
  const sprite = document.createElement("img");
  sprite.src = sceneAsset(name);
  sprite.alt = "";
  sprite.setAttribute("aria-hidden", "true");
  sprite.className = "scene-art-sprite";
  sprite.style.left = x + "px"; sprite.style.top = y + "px";
  sprite.style.width = w + "px"; sprite.style.height = h + "px";
  sprite.style.opacity = String(opacity);
  sprite.draggable = false;
  // Art is optional: missing assets must not block the functional battle grid.
  sprite.addEventListener("error", () => sprite.remove(), {once: true});
  return sprite;
};

const terrainNames: Record<string, string> = { ".": "平地", F: "森林", H: "丘陵", "#": "峭壁" };
const terrainGlyphs: Record<string, string> = { ".": "", F: "♠♠", H: "▲", "#": "▥" };
const roleNames: Record<string, string> = {
  sword: "剑", lancer: "枪", archer: "弓", mage: "术", raider: "兵", commander: "将",
};

type ArtZone = "forest" | "camp" | "river" | "cliff" | "grass";
function zoneAt(worldCol: number, worldRow: number): ArtZone {
  if (worldCol >= 13 && worldRow >= 2 && worldRow < 10) return "river";
  if (worldCol >= 11 && worldRow <= 1) return "camp";
  if (worldCol >= 13 && worldRow >= 10) return "cliff";
  if (worldCol <= 2 || worldRow <= 1 || worldRow >= 10) return "forest";
  return "grass";
}

export class BoardView {
  private readonly cells: HTMLButtonElement[] = [];
  private readonly highlights: HTMLDivElement[] = [];
  private readonly miniCells: HTMLButtonElement[] = [];
  private readonly stage: HTMLDivElement;
  private readonly unitLayer: HTMLDivElement;
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
    // S0: screen-space background continues beyond the art stage at 60% zoom.
    const backdrop = document.createElement("div");
    backdrop.className = "map-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    const world = document.createElement("div");
    world.className = "map-world world-stage";
    world.style.width = WORLD_WIDTH + "px";
    world.style.height = WORLD_HEIGHT + "px";
    this.stage = world;

    const layer = (name: string): HTMLDivElement => {
      const element = document.createElement("div");
      element.className = "world-layer " + name;
      world.appendChild(element);
      return element;
    };

    // W10: separate decorative ground. Logic terrain merely drives placeholders in A2-1.
    const ground = layer("world-ground");
    ground.style.gridTemplateColumns = "repeat(" + WORLD_COLS + ", " + TILE + "px)";
    ground.style.gridTemplateRows = "repeat(" + WORLD_ROWS + ", " + TILE + "px)";
    for (let row = 0; row < WORLD_ROWS; row++) {
      for (let col = 0; col < WORLD_COLS; col++) {
        const inside = col >= 3 && col < 3 + MAP_WIDTH && row >= 2 && row < 2 + MAP_HEIGHT;
        const terrain = inside ? battle.tile(col - 3, row - 2) : null;
        const tile = document.createElement("div");
        tile.className = "stage-ground-cell " + (inside ? "stage-terrain-" + (terrain === "." ? "plain" : terrain === "#" ? "wall" : terrain) : "stage-zone-" + zoneAt(col, row));
        tile.setAttribute("aria-hidden", "true");
        // Every cell uses a reusable terrain asset, never a screenshot of the entire map.
        // The background gradient in CSS remains visible if an SVG fails to load.
        let groundFile = "ground-grass-a.svg";
        if (zoneAt(col, row) === "river" && !inside) groundFile = "river-flow-a.svg";
        else if (!inside && zoneAt(col, row) === "camp") groundFile = "ground-path-a.svg";
        else if (terrain === "H" || terrain === "#" || (!inside && zoneAt(col, row) === "forest")) groundFile = "ground-grass-b.svg";
        else if (inside && terrain === "." && (col * 7 + row * 5) % 11 === 0) groundFile = "ground-path-a.svg";
        else if ((col * 13 + row * 3) % 5 === 0) groundFile = "ground-grass-b.svg";
        tile.style.backgroundImage = 'url("' + sceneAsset(groundFile) + '")';
        ground.appendChild(tile);
      }
    }

    // W20: independent scenic SVGs. The water, bridge and fort remain outside playable cells.
    const environment = layer("world-environment");
    const sceneSprites = [
      // Non-interactive eastern river bank: x >= 1196 is outside the 10x8 playable grid.
      ["river-bank-a.svg", 1170, 170, 178, 240, .99],
      ["river-bank-a.svg", 1170, 390, 178, 240, .99],
      ["river-bank-a.svg", 1170, 610, 178, 240, .99],
      ["cliff-face-a.svg", 1242, 148, 235, 200, .95],
      ["cliff-face-a.svg", 1242, 705, 235, 220, .95],
      ["cliff-face-b.svg", 1198, 897, 255, 170, .92],
      ["bridge-wood-a.svg", 1220, 410, 237, 126, .97],
      ["camp-platform-a.svg", 1005, 3, 405, 182, 1],
      // Actual impassable cells (3,2) and (4,2), visually distinct but no rules changed.
      ["cliff-face-b.svg", 552, 363, 184, 117, .93],
      // Forest stands: all rendered below the unit/hit layers.
      ["forest-cluster-a.svg", 0, 40, 235, 240, .94],
      ["forest-cluster-b.svg", 40, 230, 215, 297, .89],
      ["forest-cluster-a.svg", 35, 740, 205, 235, .96],
      ["forest-cluster-b.svg", 805, 0, 195, 255, .91],
      ["forest-cluster-a.svg", 328, 209, 132, 143, .81],
      ["forest-cluster-b.svg", 843, 213, 135, 164, .79],
      ["forest-cluster-a.svg", 253, 401, 140, 143, .80],
      ["forest-cluster-b.svg", 801, 605, 145, 182, .79],
    ] as const;
    for (const [file,x,y,w,h,alpha] of sceneSprites) {
      environment.appendChild(imgAsset(file,x,y,w,h,alpha));
    }

    // W30: decoration is not input. Terrain symbols are deliberately separate from hit cells.
    const decals = layer("world-decal");
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrain = battle.tile(x, y);
        if (terrain === ".") continue;
        const marker = document.createElement("div");
        marker.className = "stage-terrain-mark stage-terrain-mark-" + (terrain === "#" ? "wall" : terrain);
        marker.style.left = TACTICAL_X + x * TILE + "px";
        marker.style.top = TACTICAL_Y + y * TILE + "px";
        marker.textContent = terrainGlyphs[terrain] ?? "";
        decals.appendChild(marker);
      }
    }

    // W40: the ONLY 10x8 pointer hit surface. Outer art cells have no game commands.
    const grid = layer("tactical-hit-grid");
    grid.style.left = TACTICAL_X + "px";
    grid.style.top = TACTICAL_Y + "px";
    grid.style.gridTemplateColumns = "repeat(" + MAP_WIDTH + ", " + TILE + "px)";
    grid.style.gridTemplateRows = "repeat(" + MAP_HEIGHT + ", " + TILE + "px)";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "战术操作区域");
    const highlight = layer("tactical-highlight");
    highlight.style.left = TACTICAL_X + "px";
    highlight.style.top = TACTICAL_Y + "px";
    highlight.style.gridTemplateColumns = grid.style.gridTemplateColumns;
    highlight.style.gridTemplateRows = grid.style.gridTemplateRows;
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

        const light = document.createElement("div");
        light.className = "range-cell";
        highlight.appendChild(light);
        this.highlights.push(light);
      }
    }
    // W50: units have independent anchors; they cannot intercept input.
    this.unitLayer = layer("world-units");
    // W60: fog is visually in front, but never intercepts pointer events.
    const foreground = layer("world-foreground");
    foreground.appendChild(imgAsset("fog-low-a.svg", 17, 38, 450, 220, .5));
    foreground.appendChild(imgAsset("fog-low-a.svg", 1090, 584, 330, 175, .3));

    // S70: contextual menu stays screen-space and remains sharp when zooming.
    this.menu = document.createElement("div");
    this.menu.className = "unit-command-menu";
    this.menu.setAttribute("aria-label", "单位行动指令");
    this.menu.hidden = true;
    viewport.replaceChildren(backdrop, world, this.menu);

    // Full 16x12 stage minimap, not the old 10x8 grid.
    this.minimap = document.getElementById("minimap-grid")!;
    const mini = this.minimap;
    mini.style.gridTemplateColumns = "repeat(" + WORLD_COLS + ", 1fr)";
    mini.style.gridTemplateRows = "repeat(" + WORLD_ROWS + ", 1fr)";
    for (let row = 0; row < WORLD_ROWS; row++) {
      for (let col = 0; col < WORLD_COLS; col++) {
        const inside = col >= 3 && col < 3 + MAP_WIDTH && row >= 2 && row < 2 + MAP_HEIGHT;
        const terrain = inside ? battle.tile(col - 3, row - 2) : null;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mini-cell " + (inside
          ? "mini-" + (terrain === "." ? "plain" : terrain === "#" ? "wall" : terrain)
          : "mini-zone-" + zoneAt(col, row));
        btn.title = inside ? String.fromCharCode(65 + col - 3) + (row - 1) + " · " + terrainNames[terrain!] : "场景装饰区";
        btn.setAttribute("aria-label", "镜头定位：" + btn.title);
        btn.addEventListener("click", () => this.centerOnWorld((col + .5) * TILE, (row + .5) * TILE));
        mini.appendChild(btn);
        this.miniCells.push(btn);
      }
    }
    const tacticalOutline = document.createElement("div");
    tacticalOutline.className = "minimap-tactical-outline";
    tacticalOutline.setAttribute("aria-hidden", "true");
    mini.appendChild(tacticalOutline);
    this.viewportMarker = document.createElement("div");
    this.viewportMarker.className = "minimap-viewport";
    this.viewportMarker.setAttribute("aria-hidden", "true");
    mini.appendChild(this.viewportMarker);
    document.getElementById("map-size")!.textContent = MAP_WIDTH + " × " + MAP_HEIGHT;

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
    this.zoom = Math.min(1.15, Math.max(MIN_ZOOM, Math.min(w / WORLD_WIDTH, h / WORLD_HEIGHT)));
    this.offsetX = (w - WORLD_WIDTH * this.zoom) / 2;
    this.offsetY = (h - WORLD_HEIGHT * this.zoom) / 2;
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

    this.unitLayer.replaceChildren();
    for (const unit of this.battle.units.filter(u => u.hp > 0)) {
      const sprite = this.unitElement(unit);
      const point = tileWorld(unit.x, unit.y);
      sprite.classList.add("world-unit", unit.team === "ally" ? "has-ally" : "has-enemy");
      if (unit.spent) sprite.classList.add("is-spent");
      if (unit.id === this.battle.selectedId) sprite.classList.add("is-selected");
      sprite.style.left = point.x + "px";
      sprite.style.top = point.y + "px";
      this.unitLayer.appendChild(sprite);
    }

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = y * MAP_WIDTH + x;
        const cell = this.cells[index]!;
        const overlay = this.highlights[index]!;
        const terrain = this.battle.tile(x, y);
        const actor = this.battle.occupant(x, y);
        const coord = key({ x, y });
        const accessible = !actor && reachable.has(coord);
        const targeted = this.attackMode && targets.has(coord);
        cell.className = "battle-cell" + (actor?.id === this.battle.selectedId ? " is-selected" : "");
        overlay.className = [
          "range-cell", accessible ? "can-move" : "", targeted ? "can-attack" : "",
          actor?.id === this.battle.selectedId ? "is-selected" : "",
        ].filter(Boolean).join(" ");
        cell.setAttribute("aria-label",
          String.fromCharCode(65 + x) + (y + 1) + " " + terrainNames[terrain] + " " +
          (actor ? actor.name + " 生命 " + actor.hp + "/" + actor.maxHp :
           accessible ? "可移动" : targeted ? "可攻击" : ""));
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = this.miniCells[(y + 2) * WORLD_COLS + (x + 3)]!;
        const actor = this.battle.occupant(x, y);
        cell.classList.toggle("mini-ally", actor?.team === "ally");
        cell.classList.toggle("mini-enemy", actor?.team === "enemy");
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
    const point = tileWorld(actor.x, actor.y);
    const menuWidth = 150;
    const menuHeight = 218;
    let x = this.offsetX + (point.x + TILE / 2) * this.zoom + 10;
    let y = this.offsetY + (point.y - TILE / 2) * this.zoom - 20;
    if (x + menuWidth > this.viewport.clientWidth - 10) {
      x = this.offsetX + (point.x - TILE / 2) * this.zoom - menuWidth - 10;
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
  private centerOnWorld(worldX: number, worldY: number): void {
    this.offsetX = this.viewport.clientWidth / 2 - worldX * this.zoom;
    this.offsetY = this.viewport.clientHeight / 2 - worldY * this.zoom;
    this.applyCamera();
  }
  private applyCamera(): void {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!vw || !vh) return;
    const w = WORLD_WIDTH * this.zoom;
    const h = WORLD_HEIGHT * this.zoom;
    this.offsetX = clampCameraOffset(this.offsetX, w, vw);
    this.offsetY = clampCameraOffset(this.offsetY, h, vh);
    this.stage.style.transform =
      "translate3d(" + this.offsetX + "px," + this.offsetY + "px,0) scale(" + this.zoom + ")";
    this.onZoomChange?.(this.zoomPercent);
    const frame = minimapFrame({x: this.offsetX, y: this.offsetY, zoom: this.zoom}, vw, vh);
    this.viewportMarker.style.left = frame.left * 100 + "%";
    this.viewportMarker.style.top = frame.top * 100 + "%";
    this.viewportMarker.style.width = frame.width * 100 + "%";
    this.viewportMarker.style.height = frame.height * 100 + "%";
    if (!this.menu.hidden && this.battle.selected) this.positionMenu(this.battle.selected);
  }

  /** Used by future pointer hit mapping and by contract tests; decorative area is non-playable. */
  hitTestScreen(localX: number, localY: number) {
    return screenTile(localX, localY, {x: this.offsetX, y: this.offsetY, zoom: this.zoom});
  }
}
