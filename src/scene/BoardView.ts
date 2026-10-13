import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Point, type Unit } from "../engine/battle.ts";
import { leftClickIntent, rightClickIntent } from "./interactionPolicy.ts";
import { clampCameraOffset } from "./cameraBounds.ts";
import { buildMapScenery } from "./mapScenery.ts";
import { GroundPainter } from "./GroundPainter.ts";
import { loadMapAsset, MAP_ASSET_FILES, type MapAssetFile } from "./mapAssets.ts";
import {
  TILE, WORLD_COLS, WORLD_ROWS, WORLD_WIDTH, WORLD_HEIGHT, TACTICAL_X, TACTICAL_Y,
  MIN_ZOOM, MAX_ZOOM, tileWorld, worldScreen, minimapFrame, screenTile,
} from "./worldGeometry.ts";

// Independent ground/tree/rock assets share world coordinates with the tactical grid.
// Respect Vite's sub-directory base (/games/tactics/) rather than absolute /assets paths.
const imgAsset = (name: MapAssetFile, x: number, y: number, w: number, h: number, opacity=1): HTMLImageElement => {
  const sprite = document.createElement("img");
  sprite.decoding = "async";
  void loadMapAsset(name).then(url => { sprite.src = url; });
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
const terrainGlyphs: Record<string, string> = { ".": "", F: "♠♠", H: "▲", "#": "" };
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
  private readonly labelLayer: HTMLDivElement;
  private readonly labelNodes = new Map<string, HTMLDivElement>();
  private readonly minimapUnits: HTMLDivElement;
  private miniDrag: { pointerId: number; x: number; y: number; moved: boolean } | null = null;
  private suppressMiniClick = false;
  private readonly menu: HTMLDivElement;
  private readonly minimap: HTMLElement;
  private readonly viewportMarker: HTMLDivElement;
  private offsetX = 0;
  private offsetY = 0;
  private zoom = 1;
  private initialized = false;
  private drag: { pointerId: number; button: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
  private inspectedCell: Point | null = null;
  private suppressClick = false;
  private menuVisible = false;
  private attackMode = false;
  private previousSelection: string | null = null;
  onZoomChange: ((percent: number) => void) | null = null;
  onHint: ((message: string) => void) | null = null;
  onInspectionChange: (() => void) | null = null;
  get inspectionCell(): Point | null { return this.inspectedCell; }

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

    // W10: reusable material patches, a walkable path/slopes and decorative eastern water.
    const ground = layer("world-ground");
    const groundCanvas = document.createElement("canvas");
    groundCanvas.className = "map-ground-canvas";
    groundCanvas.setAttribute("aria-hidden", "true");
    ground.appendChild(groundCanvas);
    // Start the visible ground material before constructing repeated tree/rock nodes.
    void loadMapAsset(MAP_ASSET_FILES.ground);

    // W20: each tree/rock is independently positioned, always below highlights and units.
    const environment = layer("world-environment");
    const sceneSprites = buildMapScenery(battle.terrain);
    for (const prop of sceneSprites) {
      const sprite = imgAsset(prop.file, prop.x, prop.y, prop.width, prop.height);
      sprite.dataset.assetId = prop.id;
      environment.appendChild(sprite);
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
    // W60 stays available for future foreground effects, without hiding any scenery layer.
    layer("world-foreground");

    // S70: names, class glyphs and HP are screen-space, not scaled world text.
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "screen-unit-labels";
    this.labelLayer.setAttribute("aria-hidden", "true");
    this.menu = document.createElement("div");
    this.menu.className = "unit-command-menu";
    this.menu.setAttribute("aria-label", "单位行动指令");
    this.menu.hidden = true;
    viewport.replaceChildren(backdrop, world, this.labelLayer, this.menu);

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
    // The miniature copies the rendered material layer and reuses every placed sprite.
    const miniGround = document.createElement("canvas");
    miniGround.className = "minimap-ground";
    miniGround.setAttribute("aria-hidden", "true");
    mini.appendChild(miniGround);
    new GroundPainter(groundCanvas, miniGround, battle.terrain);
    const miniArt = document.createElement("div");
    miniArt.className = "minimap-scenery";
    miniArt.setAttribute("aria-hidden", "true");
    for (const prop of sceneSprites) {
      const img = imgAsset(prop.file, prop.x, prop.y, prop.width, prop.height);
      img.classList.add("minimap-scene-sprite");
      img.dataset.assetId = prop.id;
      img.style.left = (prop.x / WORLD_WIDTH * 100) + "%";
      img.style.top = (prop.y / WORLD_HEIGHT * 100) + "%";
      img.style.width = (prop.width / WORLD_WIDTH * 100) + "%";
      img.style.height = (prop.height / WORLD_HEIGHT * 100) + "%";
      miniArt.appendChild(img);
    }
    mini.appendChild(miniArt);
    const tacticalOutline = document.createElement("div");
    tacticalOutline.className = "minimap-tactical-outline";
    tacticalOutline.setAttribute("aria-hidden", "true");
    mini.appendChild(tacticalOutline);
    this.minimapUnits = document.createElement("div");
    this.minimapUnits.className = "minimap-units";
    this.minimapUnits.setAttribute("aria-hidden", "true");
    mini.appendChild(this.minimapUnits);
    this.viewportMarker = document.createElement("div");
    this.viewportMarker.className = "minimap-viewport";
    this.viewportMarker.setAttribute("aria-hidden", "true");
    mini.appendChild(this.viewportMarker);
    document.getElementById("map-size")!.textContent = MAP_WIDTH + " × " + MAP_HEIGHT;

    // Dragging the miniature pans the camera; keyboard/click on any cell remains accessible.
    mini.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      this.miniDrag = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
    });
    mini.addEventListener("pointermove", event => {
      const drag = this.miniDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.x, event.clientY-drag.y) < 5) return;
      if (!drag.moved) { drag.moved = true; mini.setPointerCapture(event.pointerId); }
      const rect = mini.getBoundingClientRect();
      this.centerOnWorld(
        Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * WORLD_WIDTH,
        Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) * WORLD_HEIGHT,
      );
    });
    const endMiniDrag = (event: PointerEvent) => {
      if (!this.miniDrag || this.miniDrag.pointerId !== event.pointerId) return;
      this.suppressMiniClick = this.miniDrag.moved;
      this.miniDrag = null;
      if (mini.hasPointerCapture(event.pointerId)) mini.releasePointerCapture(event.pointerId);
      window.setTimeout(() => { this.suppressMiniClick = false; }, 0);
    };
    mini.addEventListener("pointerup", endMiniDrag);
    mini.addEventListener("pointercancel", endMiniDrag);
    mini.addEventListener("click", event => {
      if (!this.suppressMiniClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressMiniClick = false;
    }, true);

    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      this.zoomAt(this.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
        event.clientX - viewport.getBoundingClientRect().left,
        event.clientY - viewport.getBoundingClientRect().top);
    }, { passive: false });
    viewport.addEventListener("pointerdown", event => this.startDrag(event));
    viewport.addEventListener("pointermove", event => this.moveDrag(event));
    viewport.addEventListener("pointerup", event => this.finishDrag(event));
    viewport.addEventListener("pointercancel", event => this.finishDrag(event, true));
    viewport.addEventListener("click", event => {
      if (!this.suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressClick = false;
    }, true);
    // Native context menus must not interrupt right-drag or close a newly opened command menu.
    viewport.addEventListener("contextmenu", event => event.preventDefault());
    viewport.addEventListener("auxclick", event => {
      if (event.button === 1 || event.button === 2) event.preventDefault();
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
      this.menuVisible = false;
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
      // Selecting with the left button only inspects; only a right-click opens commands.
      this.menuVisible = false;
      this.previousSelection = selectedId;
    }
    const reachable = selected && !selected.moved && !selected.spent
      ? this.battle.reachable(selected) : new Map<string, number>();
    const targets = new Set(selected && !selected.acted && !selected.spent
      ? this.battle.targets(selected).map(key) : []);

    this.unitLayer.replaceChildren();
    this.labelLayer.replaceChildren();
    this.labelNodes.clear();
    this.minimapUnits.replaceChildren();
    for (const unit of this.battle.units.filter(u => u.hp > 0)) {
      const point = tileWorld(unit.x, unit.y);
      const mark = this.unitElement(unit);
      mark.classList.add("world-unit", unit.team === "ally" ? "has-ally" : "has-enemy");
      if (unit.spent) mark.classList.add("is-spent");
      if (unit.id === this.battle.selectedId) mark.classList.add("is-selected");
      mark.style.left = point.x + "px";
      mark.style.top = point.y + "px";
      this.unitLayer.appendChild(mark);

      const label = this.createScreenLabel(unit);
      this.labelLayer.appendChild(label);
      this.labelNodes.set(unit.id, label);
      const pin = document.createElement("span");
      pin.className = "minimap-unit-pin " + (unit.team === "ally" ? "mini-pin-ally" : "mini-pin-enemy");
      if (unit.id === this.battle.selectedId) pin.classList.add("mini-pin-selected");
      pin.style.left = point.x / WORLD_WIDTH * 100 + "%";
      pin.style.top = point.y / WORLD_HEIGHT * 100 + "%";
      this.minimapUnits.appendChild(pin);
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
        cell.className = "battle-cell"
          + (terrain === "#" ? " is-blocked" : "")
          + (actor?.id === this.battle.selectedId ? " is-selected" : "")
          + (this.inspectedCell?.x === x && this.inspectedCell.y === y ? " is-inspected" : "");
        cell.title = terrain === "#" ? "峭壁 · 不可通行" : (terrainNames[terrain] ?? "平地");
        overlay.className = [
          "range-cell", accessible ? "can-move" : "", targeted ? "can-attack" : "",
          actor?.id === this.battle.selectedId ? "is-selected" : "",
          this.inspectedCell?.x === x && this.inspectedCell.y === y ? "is-inspected" : "",
        ].filter(Boolean).join(" ");
        cell.setAttribute("aria-label",
          String.fromCharCode(65 + x) + (y + 1) + " " + terrainNames[terrain] +
          (terrain === "#" ? " 不可通行 " : " ") +
          (actor ? actor.name + " 生命 " + actor.hp + "/" + actor.maxHp :
           accessible ? "可移动" : targeted ? "可攻击" : ""));
      }
    }
    this.renderMenu();
    this.applyCamera();
  }

  private inspectCell(x: number, y: number): void {
    this.inspectedCell = {x, y};
    this.onInspectionChange?.();
  }

  private onCellClick(x: number, y: number): void {
    if (this.battle.result !== "playing") return;
    this.inspectCell(x, y);
    const intent = leftClickIntent(this.battle, x, y, this.attackMode);
    // Left clicks are selection, inspection or movement, never a context-menu trigger.
    this.menuVisible = false;
    this.attackMode = false;
    if (intent === "select-ally" || intent === "move" || intent === "attack") {
      this.battle.click(x, y);
    } else {
      // Inspection alone cannot leave a hidden ally selected and ready to attack.
      this.battle.selectedId = null;
    }
    this.refresh();
    this.onInspectionChange?.();
  }

  private onRightCellClick(x: number, y: number): void {
    if (this.battle.result !== "playing") return;
    this.inspectCell(x, y);
    const intent = rightClickIntent(this.battle, x, y);
    this.attackMode = false;
    this.menuVisible = false;
    if (intent === "open-menu") {
      this.battle.click(x, y);
      this.menuVisible = true;
    } else {
      this.battle.selectedId = null;
    }
    this.refresh();
    this.onInspectionChange?.();
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
          this.onHint?.("攻击模式：左键点击红色目标；Esc 或右键空地取消");
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

  /** W50: world-space ground marker. All readable unit UI is drawn by S70. */
  private unitElement(unit: Unit): HTMLSpanElement {
    const mark = document.createElement("span");
    mark.className = "unit-ground-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.title = unit.name;
    return mark;
  }

  /** S70 DOM text stays at its native CSS pixel resolution at every camera zoom. */
  private createScreenLabel(unit: Unit): HTMLDivElement {
    const label = document.createElement("div");
    label.className = "screen-unit-label " + (unit.team === "ally" ? "label-ally" : "label-enemy");
    if (unit.spent) label.classList.add("label-spent");
    if (unit.id === this.battle.selectedId) label.classList.add("label-selected");
    if (this.inspectedCell?.x === unit.x && this.inspectedCell.y === unit.y) label.classList.add("label-inspected");
    const emblem = document.createElement("span");
    emblem.className = "screen-label-emblem";
    emblem.textContent = roleNames[unit.role] ?? "兵";
    const hp = document.createElement("span");
    hp.className = "screen-label-hp";
    const hpFill = document.createElement("span");
    hpFill.style.width = (100 * unit.hp / unit.maxHp) + "%";
    hp.appendChild(hpFill);
    const name = document.createElement("span");
    name.className = "screen-label-name";
    name.textContent = unit.name;
    label.append(emblem, hp, name);
    return label;
  }

  private startDrag(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    if ((e.target as HTMLElement).closest(".unit-command-menu")) return;
    if (this.drag) return;
    // Right mouse dragging pans the map exactly like left dragging.
    this.drag = { pointerId: e.pointerId, button: e.button, x: e.clientX, y: e.clientY,
      offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
  }
  private moveDrag(e: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
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
  private finishDrag(e: PointerEvent, cancelled = false): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    this.drag = null;
    this.suppressClick = drag.button === 0 && drag.moved;
    if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
    if (!cancelled && drag.button === 2 && !drag.moved) {
      const rect = this.viewport.getBoundingClientRect();
      const tile = this.hitTestScreen(e.clientX - rect.left, e.clientY - rect.top);
      if (tile) this.onRightCellClick(tile.x, tile.y);
      else this.hideCommandMenu();
    }
    // A completed drag may not dispatch click in all browsers.
    window.setTimeout(() => { this.suppressClick = false; }, 0);
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
    // Project labels from world footpoints to viewport pixels, without CSS world scaling.
    const camera = {x: this.offsetX, y: this.offsetY, zoom: this.zoom};
    for (const unit of this.battle.units.filter(u => u.hp > 0)) {
      const label = this.labelNodes.get(unit.id);
      if (!label) continue;
      const point = tileWorld(unit.x, unit.y);
      const screen = worldScreen(point.x, point.y, camera);
      label.style.left = screen.x + "px";
      label.style.top = screen.y + "px";
      label.hidden = screen.x < -75 || screen.y < -85 || screen.x > vw + 75 || screen.y > vh + 95;
      label.classList.toggle("label-compact", this.zoom < .80);
    }
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
