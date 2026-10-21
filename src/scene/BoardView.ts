import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Point, type Unit, type AttackForecast, type EnemyActionPlan, type CombatEvent, type SupportEffect, type SupportPreview } from "../engine/battle.ts";
import { combatPreviewView } from "./combatPreviewView.ts";
import {flatBattleCommands,type FlatCommand} from "./flatBattleCommands.ts";
import {WEAPON_LIBRARY,weaponRange,canWield} from "../engine/weapons.ts";
import {weaponRankForExp,weaponExperienceText} from "../engine/proficiency.ts";
import {weaponResourceText} from "../engine/combatResources.ts";
import {COMBAT_ARTS} from "../engine/combatArts.ts";
import {CAREER_ARTS,isCareerArtId} from "../engine/careerArts.ts";
import {CLASS_LIBRARY} from "../engine/classes.ts";
import { TERRAIN_INFO, movementCostLabel } from "../engine/terrain.ts";
import { leftClickIntent, rightClickIntent } from "./interactionPolicy.ts";
import { clampCameraOffset } from "./cameraBounds.ts";
import { buildMapScenery } from "./mapScenery.ts";
import { GroundPainter } from "./GroundPainter.ts";
import { InspectionState } from "./InspectionState.ts";
import {pinchCamera,touchPair,type Contact,type PinchOrigin} from "./touchCamera.ts";
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

const terrainGlyphs: Record<string, string> = { ".": "", G: "", F: "♠♠", H: "", "#": "" };

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
  private readonly moveHighlights: HTMLDivElement[] = [];
  private readonly attackHighlights: HTMLDivElement[] = [];
  private readonly routeSvg: SVGSVGElement;
  private readonly routeLine: SVGPathElement;
  private readonly routeOutline: SVGPathElement;
  private hoveredTile: Point | null = null;
  private readonly miniCells: HTMLButtonElement[] = [];
  private readonly stage: HTMLDivElement;
  private sceneryLayer:HTMLDivElement;
  private decalLayer:HTMLDivElement;
  private miniScenery:HTMLDivElement;
  private groundPainter:GroundPainter;
  private renderedLevelId:string;
  private readonly unitLayer: HTMLDivElement;
  private readonly labelLayer: HTMLDivElement;
  private readonly labelNodes = new Map<string, HTMLDivElement>();
  private readonly markNodes = new Map<string, HTMLSpanElement>();
  private readonly pinNodes = new Map<string, HTMLSpanElement>();
  private animationLocked = false;
  private combatPlaying = false;
  private combatSkipRemaining = false;
  private combatEpoch = 0;
  private skipCombatStep: (()=>void) | null = null;
  private combatOverlay: HTMLDivElement;
  onCombatCommitted: (()=>void) | null = null;
  onCombatPresentationEnded: (()=>void) | null = null;
  private animationEpoch = 0;
  private animationPose: {id: string; x: number; y: number} | null = null;
  get isAnimating(): boolean { return this.animationLocked || this.combatPlaying; }
  private readonly minimapUnits: HTMLDivElement;
  private miniDrag: { pointerId: number; x: number; y: number; moved: boolean } | null = null;
  private suppressMiniClick = false;
  private readonly menu: HTMLDivElement;
  private readonly weaponPicker: HTMLDivElement;
  private pickerMode:"attack"|"art"|"formal"|"career"|"equip"|"status"|null=null;
  private supportMode:SupportEffect|null=null;
  private careerSupportId:string|null=null;
  private attackArtId:string|null=null;
  private readonly minimap: HTMLElement;
  private readonly viewportMarker: HTMLDivElement;
  private offsetX = 0;
  private offsetY = 0;
  private zoom = 1;
  private initialized = false;
  private drag: { pointerId: number; button: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
  private readonly inspection: InspectionState;
  private suppressClick = false;
  private readonly touchPoints = new Map<number,Contact>();
  private pinchOrigin:PinchOrigin | null = null;
  private menuVisible = false;
  private attackMode = false;
  private forecastTargetId: string | null = null;
  private readonly forecastPanel: HTMLElement;
  private enemyForecast: { attacker: Unit; defender: Unit; forecast: AttackForecast } | null = null;
  private dismissEnemyForecast: (() => void) | null = null;
  private previousSelection: string | null = null;
  onZoomChange: ((percent: number) => void) | null = null;
  onHint: ((message: string) => void) | null = null;
  onInspectionChange: (() => void) | null = null;
  onInventoryRequested: (() => void) | null = null;
  get inspectionCell(): Point | null { return this.inspection.cell; }
  clearInspection(): void {
    this.inspection.clear();
    this.onInspectionChange?.();
    this.refresh();
  }

  constructor(private readonly battle: Battle, private readonly viewport: HTMLElement) {
    this.inspection = new InspectionState(battle);
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
    this.sceneryLayer=environment;
    const sceneSprites = buildMapScenery(battle.terrain);
    for (const prop of sceneSprites) {
      const sprite = imgAsset(prop.file, prop.x, prop.y, prop.width, prop.height);
      sprite.dataset.assetId = prop.id;
      environment.appendChild(sprite);
    }

    // W30: decoration is not input. Terrain symbols are deliberately separate from hit cells.
    const decals = layer("world-decal");
    this.decalLayer=decals;
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
    // The two grid layers share the same world coordinates and never hit-test.
    const makeHighlight = (kind: "move" | "attack"): HTMLDivElement => {
      const el=layer("tactical-highlight tactical-highlight-"+kind);
      el.style.left=TACTICAL_X+"px";
      el.style.top=TACTICAL_Y+"px";
      el.style.gridTemplateColumns=grid.style.gridTemplateColumns;
      el.style.gridTemplateRows=grid.style.gridTemplateRows;
      el.setAttribute("aria-hidden","true");
      return el;
    };
    const moveLayer=makeHighlight("move");
    const attackLayer=makeHighlight("attack");
    for(let y=0;y<MAP_HEIGHT;y++){
      for(let x=0;x<MAP_WIDTH;x++){
        const cell=document.createElement("button");
        cell.type="button";
        cell.className="battle-cell";
        cell.dataset.x=String(x);
        cell.dataset.y=String(y);
        cell.addEventListener("click",()=>this.onCellClick(x,y));
        grid.appendChild(cell);
        this.cells.push(cell);
        const moveCell=document.createElement("div");
        moveCell.className="range-cell";
        moveLayer.appendChild(moveCell);
        this.moveHighlights.push(moveCell);
        const attackCell=document.createElement("div");
        attackCell.className="range-cell";
        attackLayer.appendChild(attackCell);
        this.attackHighlights.push(attackCell);
      }
    }
    // The route is a non-interactive world-space overlay, always above
    // movement highlights but below character sprites and labels.
    const routeLayer=layer("tactical-route");
    routeLayer.style.left=TACTICAL_X+"px";
    routeLayer.style.top=TACTICAL_Y+"px";
    routeLayer.style.width=(MAP_WIDTH*TILE)+"px";
    routeLayer.style.height=(MAP_HEIGHT*TILE)+"px";
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.classList.add("route-preview-svg");
    svg.setAttribute("viewBox","0 0 "+(MAP_WIDTH*TILE)+" "+(MAP_HEIGHT*TILE));
    svg.setAttribute("aria-hidden","true");
    const defs=document.createElementNS("http://www.w3.org/2000/svg","defs");
    const marker=document.createElementNS("http://www.w3.org/2000/svg","marker");
    marker.setAttribute("id","tactical-route-arrowhead");
    marker.setAttribute("viewBox","0 0 12 12");
    marker.setAttribute("refX","10");
    marker.setAttribute("refY","6");
    marker.setAttribute("markerWidth","10");
    marker.setAttribute("markerHeight","10");
    marker.setAttribute("orient","auto");
    const triangle=document.createElementNS("http://www.w3.org/2000/svg","path");
    triangle.setAttribute("d","M 1 1 L 11 6 L 1 11 z");
    triangle.setAttribute("fill","#ffe5a0");
    triangle.setAttribute("stroke","#132b36");
    triangle.setAttribute("stroke-width","1");
    marker.appendChild(triangle);
    defs.appendChild(marker);
    const outline=document.createElementNS("http://www.w3.org/2000/svg","path");
    outline.classList.add("route-preview-outline");
    const line=document.createElementNS("http://www.w3.org/2000/svg","path");
    line.classList.add("route-preview-line");
    line.setAttribute("marker-end","url(#tactical-route-arrowhead)");
    svg.append(defs,outline,line);
    routeLayer.appendChild(svg);
    this.routeSvg=svg;
    this.routeLine=line;
    this.routeOutline=outline;
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
    this.weaponPicker=document.createElement("div");
    this.weaponPicker.className="weapon-picker";
    this.weaponPicker.setAttribute("aria-label","武器选择");
    this.weaponPicker.hidden=true;
    this.forecastPanel = document.getElementById("attack-forecast")!;
    this.combatOverlay = document.createElement("div");
    this.combatOverlay.className = "combat-performance";
    this.combatOverlay.hidden = true;
    this.combatOverlay.setAttribute("aria-label","战斗演出");
    document.querySelector(".battlefield")!.appendChild(this.combatOverlay);
    document.getElementById("forecast-confirm")!.addEventListener("click", () => this.confirmAttack());
    document.getElementById("forecast-cancel")!.addEventListener("click", () => this.cancelAction());
    viewport.replaceChildren(backdrop, world, this.labelLayer, this.menu, this.weaponPicker);

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
        btn.title = inside ? String.fromCharCode(65 + col - 3) + (row - 1) + " · " + TERRAIN_INFO[terrain!].name : "场景装饰区";
        const mission=battle.currentLevel.victory;
        if(inside&&mission.kind==="reach-tile"&&mission.x===col-3&&mission.y===row-2)
          btn.classList.add("mini-extraction");
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
    this.groundPainter=new GroundPainter(groundCanvas, miniGround, battle.terrain);
    const miniArt = document.createElement("div");
    this.miniScenery=miniArt;
    this.renderedLevelId=battle.selectedLevelId;
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
    viewport.addEventListener("pointerdown", event => this.pointerDown(event));
    viewport.addEventListener("pointermove", event => {
      this.pointerMove(event);
      this.trackPointerHover(event);
    });
    viewport.addEventListener("pointerleave", event => {
      if(event.pointerType==="touch")return;
      this.hoveredTile=null;
      this.renderRangeHighlights();
    });
    viewport.addEventListener("pointerup", event => this.pointerEnd(event));
    viewport.addEventListener("pointercancel", event => this.pointerEnd(event, true));
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
    // The wide full-stage overview clips most allied units on a phone.
    // Frame the initial mobile view on the allied deployment area instead;
    // players can still drag and zoom to inspect enemies and the riverbank.
    if (w <= 600) {
      const ally=tileWorld(1,5);
      this.offsetX = w*.44 - ally.x*this.zoom;
    } else {
      this.offsetX = (w - WORLD_WIDTH * this.zoom) / 2;
    }
    this.offsetY = (h - WORLD_HEIGHT * this.zoom) / 2;
    this.applyCamera();
  }
  /** Undo the selected ally's tentative move without spending an action. */
  private undoTentativeMove(): boolean {
    if (this.isAnimating || !this.battle.canCancelMove) return false;
    this.menuVisible = false;
    this.attackMode = false;
    this.supportMode=null;this.careerSupportId=null;
    this.pickerMode = null;
    this.forecastTargetId = null;
    if (!this.battle.cancelMove()) return false;
    const actor = this.battle.selected!;
    this.inspectCell(actor.x, actor.y);
    this.refresh();
    return true;
  }

  /** In-place confirmation or post-walk commands, never on first selection. */
  private showConfirmedCommands(unitId: string): void {
    const actor = this.battle.selected;
    if (!actor || actor.id !== unitId || actor.team !== "ally" || actor.spent ||
        this.battle.phase !== "player" || this.battle.result !== "playing" ||
        this.isAnimating) return;
    this.pickerMode = null;
    this.forecastTargetId = null;
    this.attackMode = false;
    this.attackArtId=null;
    this.supportMode=null;this.careerSupportId=null;
    this.menuVisible = true;
    this.refresh();
    this.onInspectionChange?.();
  }

  cancelAction(): boolean {
    if (this.isAnimating || this.battle.phase !== "player") return false;
    if (this.forecastTargetId) {
      this.forecastTargetId = null;
      this.renderForecast();
      this.refresh();
      return true;
    }
    if (this.attackMode) {
      // Single-level action bar: cancelling a target always returns to it.
      this.attackMode=false;this.attackArtId=null;
      this.supportMode=null;this.careerSupportId=null;this.pickerMode=null;
      this.menuVisible=true;this.refresh();return true;
    }
    if (this.pickerMode) {
      this.pickerMode = null;
      this.menuVisible = true;
      this.refresh();
      return true;
    }
    if (this.menuVisible) {
      if (this.battle.canCancelMove) return this.undoTentativeMove();
      this.menuVisible = false;
      this.refresh();
      return true;
    }
    if (this.battle.canCancelMove) return this.undoTentativeMove();
    return false;
  }
  hideCommandMenu(): void {
    this.pickerMode = null;
    this.forecastTargetId = null;
    this.attackMode = false;
    this.attackArtId=null;
    this.supportMode=null;
    this.menuVisible = false;
    this.renderForecast();
    this.refresh();
  }
  private syncLevelTerrain():void{
    if(this.renderedLevelId===this.battle.selectedLevelId)return;
    this.renderedLevelId=this.battle.selectedLevelId;
    const terrain=this.battle.terrain;
    this.groundPainter.setTerrain(terrain);
    this.sceneryLayer.replaceChildren();
    this.decalLayer.replaceChildren();
    this.miniScenery.replaceChildren();
    for(const prop of buildMapScenery(terrain)){
      const sprite=imgAsset(prop.file,prop.x,prop.y,prop.width,prop.height);
      sprite.dataset.assetId=prop.id;this.sceneryLayer.appendChild(sprite);
      const small=imgAsset(prop.file,prop.x,prop.y,prop.width,prop.height);
      small.classList.add("minimap-scene-sprite");small.dataset.assetId=prop.id;
      small.style.left=prop.x/WORLD_WIDTH*100+"%";
      small.style.top=prop.y/WORLD_HEIGHT*100+"%";
      small.style.width=prop.width/WORLD_WIDTH*100+"%";
      small.style.height=prop.height/WORLD_HEIGHT*100+"%";
      this.miniScenery.appendChild(small);
    }
    for(let y=0;y<MAP_HEIGHT;y++)for(let x=0;x<MAP_WIDTH;x++){
      const t=this.battle.tile(x,y);if(t===".")continue;
      const marker=document.createElement("div");
      marker.className="stage-terrain-mark stage-terrain-mark-"+(t==="#"?"wall":t);
      marker.style.left=TACTICAL_X+x*TILE+"px";
      marker.style.top=TACTICAL_Y+y*TILE+"px";
      marker.textContent=terrainGlyphs[t]??"";
      this.decalLayer.appendChild(marker);
    }
    for(let row=2;row<2+MAP_HEIGHT;row++)for(let col=3;col<3+MAP_WIDTH;col++){
      const t=this.battle.tile(col-3,row-2),btn=this.miniCells[row*WORLD_COLS+col]!;
      btn.className="mini-"+(t==="."?"plain":t==="#"?"wall":t);
      btn.title=String.fromCharCode(65+col-3)+(row-1)+" · "+TERRAIN_INFO[t].name;
      btn.setAttribute("aria-label","镜头定位："+btn.title);
      const mission=this.battle.currentLevel.victory;
      btn.classList.toggle("mini-extraction",
        mission.kind==="reach-tile"&&mission.x===col-3&&mission.y===row-2);
    }
  }
  refresh(): void {
    this.syncLevelTerrain();
    const selected = this.battle.selected;
    const selectedId = selected?.id ?? null;
    if (selectedId !== this.previousSelection) {
      this.pickerMode = null;
      this.attackMode = false;
      this.attackArtId=null;
      this.supportMode=null;
      this.forecastTargetId = null;
      // Commands appear only after choosing a destination or confirming stay.
      this.menuVisible = false;
      this.previousSelection = selectedId;
    }
    this.unitLayer.replaceChildren();
    this.labelLayer.replaceChildren();
    this.labelNodes.clear();
    this.markNodes.clear();
    this.minimapUnits.replaceChildren();
    this.pinNodes.clear();
    for (const unit of this.battle.units.filter(u => u.hp > 0)) {
      const point = tileWorld(unit.x, unit.y);
      const mark = this.unitElement(unit);
      mark.classList.add("world-unit", unit.team === "ally" ? "has-ally" : "has-enemy");
      if (unit.spent) mark.classList.add("is-spent");
      if (unit.id === this.battle.selectedId) mark.classList.add("is-selected");
      mark.style.left = point.x + "px";
      mark.style.top = point.y + "px";
      this.unitLayer.appendChild(mark);
      this.markNodes.set(unit.id, mark);

      const label = this.createScreenLabel(unit);
      this.labelLayer.appendChild(label);
      this.labelNodes.set(unit.id, label);
      const pin = document.createElement("span");
      pin.className = "minimap-unit-pin " + (unit.team === "ally" ? "mini-pin-ally" : "mini-pin-enemy");
      if (unit.id === this.battle.selectedId) pin.classList.add("mini-pin-selected");
      pin.style.left = point.x / WORLD_WIDTH * 100 + "%";
      pin.style.top = point.y / WORLD_HEIGHT * 100 + "%";
      this.minimapUnits.appendChild(pin);
      this.pinNodes.set(unit.id, pin);
    }

    this.renderRangeHighlights();
    this.renderMenu();
    this.renderWeaponPicker();
    this.renderForecast();
    this.applyCamera();
  }

  /** Enemy hover and inspection show blue movement + red attack coverage.
   * Allies retain touch union or desktop single-endpoint hover previews.
   * Repaint range cells without recreating units or labels.
   */
  private renderRangeHighlights(): void {
    const active=this.battle.result==="playing" && !this.isAnimating;
    const inspectedCell=this.inspectionCell;
    const inspected=inspectedCell
      ? this.battle.occupant(inspectedCell.x,inspectedCell.y) : undefined;
    const selected=this.battle.selected;
    const mouseUnit=this.hoveredTile
      ? this.battle.occupant(this.hoveredTile.x,this.hoveredTile.y) : undefined;
    const hoverMode=active && !!mouseUnit && !this.attackMode &&
      !this.forecastTargetId && !this.pickerMode;
    const focus=hoverMode ? mouseUnit :
      inspected ?? selected;
    const actionable=active && !this.attackMode && !this.forecastTargetId &&
      !this.pickerMode && !!focus;
    const range=actionable && focus
      ? focus.team==="enemy"
        ? this.battle.enemyThreat(focus)
        : this.battle.allyThreat(focus)
      : null;
    const move=range?.move ?? new Set<string>();
    const targeting = new Set(selected && !selected.acted && !selected.spent
      ? this.battle.targets(selected).map(key) : []);
    // Enemy inspections always show all legal attacks; touch-first allies
    // need the same projection because touch has no hover destination.
    // Mouse allies retain their single-endpoint attack preview.
    const touchAttackUnion=!!selected && actionable && !hoverMode &&
      focus?.team==="ally" && focus.id===selected.id &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const enemyAttackUnion=actionable && focus?.team==="enemy";
    const showAttackUnion=touchAttackUnion || enemyAttackUnion;
    let route:Point[]|null=null;
    let attacks=showAttackUnion ? range?.attack ?? new Set<string>() : new Set<string>();
    if(actionable && !hoverMode && focus && this.hoveredTile &&
       move.has(key(this.hoveredTile)) &&
       (!mouseUnit || mouseUnit.id===focus.id)) {
      const forecast=this.battle.previewMovementAttack(focus,this.hoveredTile);
      route=forecast?.path??null;
      if(!showAttackUnion) attacks=forecast?.attack??new Set();
    }
    this.drawRoute(route);
    for (let y=0;y<MAP_HEIGHT;y++) {
      for(let x=0;x<MAP_WIDTH;x++) {
        const index=y*MAP_WIDTH+x;
        const cell=this.cells[index]!;
        const moveOverlay=this.moveHighlights[index]!;
        const attackOverlay=this.attackHighlights[index]!;
        const terrain=this.battle.tile(x,y);
        const mission=this.battle.currentLevel.victory;
        const extraction=mission.kind==="reach-tile"&&mission.x===x&&mission.y===y;
        const occupant=this.battle.occupant(x,y);
        const coord=key({x,y});
        const canMove=move.has(coord);
        const moveFill=canMove && (!occupant || occupant.id===focus?.id);
        // In enemy/touch attack unions blue movement wins. Desktop ally hover
        // with a single destination still shows the red attacking area.
        const attack=attacks.has(coord) && (!showAttackUnion || !moveFill);
        const targeted=this.attackMode && targeting.has(coord);
        const inspectedHere=this.inspectionCell?.x===x && this.inspectionCell.y===y;
        cell.className="battle-cell"
          +(terrain==="#"?" is-blocked":"")
          +(extraction?" is-extraction":"")
          +(occupant?.id===this.battle.selectedId?" is-selected":"")
          +(inspectedHere?" is-inspected":"");
        cell.title=TERRAIN_INFO[terrain].name+" · "+
          (terrain==="#"?"不可通行":"移动消耗 "+movementCostLabel(terrain));
        moveOverlay.className=[
          "range-cell",
          moveFill ? (focus?.team==="enemy" ? "route-move-enemy" : "route-move-ally"):"",
          moveFill && attack ? "route-under-attack":"",
          route?.some(p=>p.x===x && p.y===y) ? "route-step":"",
          occupant?.id===this.battle.selectedId?"is-selected":"",
          inspectedHere?"is-inspected":"",
        ].filter(Boolean).join(" ");
        attackOverlay.className=[
          "range-cell",
          targeted?"can-attack":"",
          attack?"route-attack":"",
          (targeted||attack) && occupant?.id===this.battle.selectedId?"is-selected":"",
          (targeted||attack) && inspectedHere?"is-inspected":"",
        ].filter(Boolean).join(" ");
        cell.setAttribute("aria-label",
          String.fromCharCode(65+x)+(y+1)+" "+TERRAIN_INFO[terrain].name+
          (terrain==="#"?" 不可通行 ":" ")+
          (occupant?occupant.name+" 生命 "+occupant.hp+"/"+occupant.maxHp:
           targeted?"可攻击目标":
           attack&&moveFill?"移动终点与该处攻击范围":
           attack?(showAttackUnion
             ?(enemyAttackUnion?"敌方移动后可攻击范围":"我方移动后可攻击范围")
             :"所选移动终点的攻击范围"):
           moveFill?(focus?.team==="enemy"
             ?(attacks.has(coord)?"敌方可移动范围（同时属于可攻击覆盖区）":"敌方可移动范围")
             :touchAttackUnion && attacks.has(coord)
               ?"我方可移动范围（同时属于可攻击覆盖区）":"我方可移动范围"):""));
      }
    }
  }

  private drawRoute(path: readonly Point[]|null): void {
    const isReal=!!path && path.length>1;
    this.routeSvg.classList.toggle("is-hidden",!isReal);
    if(!isReal){this.routeLine.removeAttribute("d");this.routeOutline.removeAttribute("d");return;}
    const first=path[0]!;
    const parts=["M "+((first.x+.5)*TILE)+" "+((first.y+.5)*TILE)];
    for(const p of path.slice(1))parts.push("L "+((p.x+.5)*TILE)+" "+((p.y+.5)*TILE));
    const d=parts.join(" ");
    this.routeOutline.setAttribute("d",d);
    this.routeLine.setAttribute("d",d);
  }

  private trackPointerHover(event: PointerEvent): void {
    if(event.pointerType==="touch" || this.drag?.moved || this.pinchOrigin ||
       this.isAnimating || this.battle.result!=="playing")return;
    if((event.target as HTMLElement).closest(".unit-command-menu, .weapon-picker"))return;
    const rect=this.viewport.getBoundingClientRect();
    const tile=this.hitTestScreen(event.clientX-rect.left,event.clientY-rect.top);
    if(tile?.x===this.hoveredTile?.x && tile?.y===this.hoveredTile?.y)return;
    if(!tile && !this.hoveredTile)return;
    this.hoveredTile=tile ? {x:tile.x,y:tile.y} : null;
    this.renderRangeHighlights();
  }

  private inspectCell(x: number, y: number): void {
    this.inspection.inspect(x, y);
    this.onInspectionChange?.();
  }

  private onCellClick(x: number, y: number): void {
    if (this.battle.result !== "playing" || this.battle.phase !== "player" || this.isAnimating) return;
    const touched = this.battle.occupant(x,y);
    if(this.supportMode){
      const actor=this.battle.selected;
      const available=actor&&touched&&(this.careerSupportId?
        this.battle.previewCareerSupport(actor,touched,this.careerSupportId):
        this.battle.previewSupport(actor,touched,this.supportMode));
      if(available){
        this.forecastTargetId=touched.id;this.menuVisible=false;
        this.inspectCell(x,y);this.refresh();this.onInspectionChange?.();
      }else this.onHint?.("目标不在施法范围内，或无法施加当前效果");
      return;
    }
    const intent = leftClickIntent(this.battle, x, y, this.attackMode);
    // The second click commits staying in place on desktop and mobile.
    if (intent === "confirm-stay" && !this.pickerMode && !this.forecastTargetId) {
      this.inspectCell(x,y);
      this.showConfirmedCommands(touched!.id);
      return;
    }
    if (intent === "select-ally" && touched?.id === this.battle.selectedId &&
        touched.moved && !this.attackMode && !this.pickerMode && !this.forecastTargetId) {
      this.inspectCell(x,y);
      this.showConfirmedCommands(touched.id);
      return;
    }
    this.inspectCell(x, y);
    if (intent === "attack") {
      const selected = this.battle.selected;
      const target = this.battle.occupant(x, y);
      if (selected && target && this.battle.forecastAttack(selected, target,
          this.attackArtId??undefined)) {
        this.forecastTargetId = target.id;
        this.menuVisible = false;
        this.refresh();
        this.onInspectionChange?.();
        return;
      }
    }
    this.forecastTargetId = null;
    this.menuVisible = false;
    this.attackMode = false;
    this.pickerMode = null;
    this.careerSupportId=null;
    if (intent === "select-ally" || intent === "move") {
      const mover = intent === "move" ? this.battle.selected : undefined;
      const path = mover ? this.battle.movementPath(mover, {x, y}) : null;
      this.battle.click(x, y);
      if (mover && path && path.length > 1 && mover.x === x && mover.y === y) {
        // Logic is committed first; display travels one real path cell per segment.
        // Let the unit finish the visual walk before opening any commands.
        void this.animateMovement(mover.id, path).then(() => {
          if (mover.moved) this.showConfirmedCommands(mover.id);
        });
      }
    } else if (!this.battle.canCancelMove) {
      this.battle.selectedId = null;
    }
    this.refresh();
    this.onInspectionChange?.();
  }

  /** Mobile allows explicitly confirming an in-place action via the dock. */
  openMobileCommands(): boolean {
    const unit=this.battle.selected;
    if(!unit || unit.team!=="ally" || unit.spent || this.isAnimating ||
       this.battle.phase!=="player" || this.battle.result!=="playing") return false;
    this.showConfirmedCommands(unit.id);
    return true;
  }

  /** Right-click short press undoes movement; right-drag still pans the map. */
  private onRightCellClick(x: number, y: number): void {
    if (this.battle.result !== "playing" || this.battle.phase !== "player" || this.isAnimating) return;
    if (rightClickIntent(this.battle,x,y) === "undo-move" && this.undoTentativeMove()) return;
    this.pickerMode = null;
    this.forecastTargetId = null;
    this.attackMode = false;
    this.supportMode=null;this.careerSupportId=null;
    this.menuVisible = false;
    this.battle.selectedId = null;
    this.inspection.clear();
    this.refresh();
    this.onInspectionChange?.();
  }

  /** Enemy action is paused until a 5s timeout or one mouse click.
   * The click is captured and consumed; it never selects a tile or triggers a UI button.
   * Closing the preview does NOT skip the actual combat commit.
   */
  showEnemyCombatPreview(plan: EnemyActionPlan, durationMs = 5000): Promise<void> {
    const enemy = this.battle.units.find(u => u.id === plan.unitId && u.hp > 0);
    const ally = this.battle.units.find(u => u.id === plan.targetId && u.hp > 0);
    if (!enemy || !ally || this.battle.phase !== "enemy") return Promise.resolve();
    const projected = {...enemy, x: plan.destination.x, y: plan.destination.y};
    const forecast = this.battle.forecastAttack(projected, ally);
    if (!forecast) return Promise.resolve();

    // Always close a previous pending preview before opening another.
    this.cancelEnemyCombatPreview();
    this.enemyForecast = {attacker: projected, defender: ally, forecast};
    this.forecastPanel.classList.add("enemy-auto-forecast");
    this.renderForecast();

    return new Promise<void>(resolve => {
      let closed = false;
      let timeoutId: number | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        window.removeEventListener("click", skipClick, true);
        this.dismissEnemyForecast = null;
        this.enemyForecast = null;
        this.forecastPanel.classList.remove("enemy-auto-forecast");
        this.renderForecast();
        resolve();
      };
      const skipClick = (event: MouseEvent) => {
        // One click only dismisses the preview, not the scheduled attack.
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      };
      this.dismissEnemyForecast = close;
      window.addEventListener("click", skipClick, true);
      timeoutId = window.setTimeout(close, durationMs);
    });
  }

  cancelEnemyCombatPreview(): void {
    this.dismissEnemyForecast?.();
  }

  /** Enemy logic still occupies the starting tile while its walk is presented.
   * Hold all three markers at the end tile until the planned action is committed.
   */
  holdUnitAt(unitId: string, position: Point): void {
    this.animationPose = {id: unitId, x: position.x, y: position.y};
    this.paintAnimationPose();
  }

  releaseUnitHold(): void {
    this.animationPose = null;
  }

  private renderForecast(): void {
    const enemyPreview = this.enemyForecast;
    if (enemyPreview) {
      this.paintForecast(enemyPreview.attacker, enemyPreview.defender, enemyPreview.forecast);
      return;
    }
    const attacker = this.battle.selected;
    const defender = this.battle.units.find(u => u.id === this.forecastTargetId && u.hp > 0);
    if(this.supportMode&&attacker&&defender){
      const support=this.careerSupportId?
        this.battle.previewCareerSupport(attacker,defender,this.careerSupportId):
        this.battle.previewSupport(attacker,defender,this.supportMode);
      if(support){this.paintSupportForecast(attacker,defender,support);return;}
    }
    const forecast = !this.supportMode&&attacker&&defender?
      this.battle.forecastAttack(attacker,defender,this.attackArtId??undefined):null;
    if (!attacker || !defender || !forecast) {
      this.forecastPanel.hidden = true;
      this.forecastTargetId = null;
      return;
    }
    this.paintForecast(attacker, defender, forecast);
  }

  private paintForecast(attacker: Unit, defender: Unit, forecast: AttackForecast): void {
    const view = combatPreviewView(attacker, defender, forecast);
    const byId = (id: string): HTMLElement => document.getElementById(id)!;
    byId("forecast-attacker").textContent = view.ally.unit.name;
    byId("forecast-defender").textContent = view.enemy.unit.name;
    byId("forecast-ally-role").textContent = CLASS_LIBRARY[view.ally.unit.classId].emblem;
    byId("forecast-ally-weapon").textContent = view.ally.unit.weapon.name;
    byId("forecast-enemy-role").textContent = CLASS_LIBRARY[view.enemy.unit.classId].emblem;
    byId("forecast-enemy-weapon").textContent = view.enemy.unit.weapon.name;
    byId("forecast-ally-emblem").textContent = CLASS_LIBRARY[view.ally.unit.classId].emblem;
    byId("forecast-enemy-emblem").textContent = CLASS_LIBRARY[view.enemy.unit.classId].emblem;
    byId("forecast-ally-hp").textContent = view.ally.unit.hp + " → " + view.ally.hpAfter;
    byId("forecast-enemy-hp").textContent = view.enemy.unit.hp + " → " + view.enemy.hpAfter;
    byId("forecast-ally-odds").textContent = view.ally.hitText;
    byId("forecast-enemy-odds").textContent = view.enemy.hitText;
    byId("forecast-damage").textContent = view.ally.damageText;
    byId("forecast-counter").textContent = view.enemy.damageText;
    for (const [id, amount] of [
      ["forecast-ally-bar", view.ally.unit.hp / view.ally.unit.maxHp],
      ["forecast-ally-after", view.ally.hpAfter / view.ally.unit.maxHp],
      ["forecast-enemy-bar", view.enemy.unit.hp / view.enemy.unit.maxHp],
      ["forecast-enemy-after", view.enemy.hpAfter / view.enemy.unit.maxHp],
    ] as const) {
      byId(id).style.width = Math.max(0, Math.min(100, amount * 100)) + "%";
    }
    const cost=document.getElementById("forecast-action-cost")!;
    const isArt=!!this.attackArtId&&!this.enemyForecast;
    const art=this.attackArtId&&Object.hasOwn(COMBAT_ARTS,this.attackArtId)?
      COMBAT_ARTS[this.attackArtId as keyof typeof COMBAT_ARTS]:null;
    const career=isCareerArtId(this.attackArtId)?CAREER_ARTS[this.attackArtId]:null;
    cost.textContent=career?career.name+" · "+career.description+" · "+
      (attacker.weapon.kind==="magical"?"次数 -":"耐久 -")+career.cost+
      (forecast.retreatTo?" · 击败后预计回退到("+forecast.retreatTo.x+","+forecast.retreatTo.y+")":""):
      art?art.name+" · "+art.description+" · "+
      (attacker.weapon.kind==="magical"?"次数 -":"耐久 -")+art.cost:
      isArt?"试验战技 · 耐久 -"+this.battle.basicArt.durabilityCost+
      " · 本次伤害 +"+this.battle.basicArt.damageBonus:
      (attacker.weapon.kind==="magical"?"法术交战 · 次数 -1":"普通攻击 · 耐久不消耗");
    document.getElementById("forecast-confirm")!.textContent=career?"确认"+career.name:
      art?"确认"+art.name:
      isArt?"确认试验战技":"攻击";
    this.forecastPanel.hidden = false;
  }

  private paintSupportForecast(actor:Unit,target:Unit,preview:SupportPreview):void{
    const elem=(id:string):HTMLElement=>document.getElementById(id)!;
    const label:Record<SupportEffect,string>={heal:"治疗",shield:"护盾",burn:"灼烧",
      slow:"缓足",weakArmor:"弱甲",weakMagic:"弱咒",mark:"标记",wardArmor:"护壁"};
    elem("forecast-attacker").textContent=actor.name;
    elem("forecast-defender").textContent=target.name;
    elem("forecast-ally-role").textContent=CLASS_LIBRARY[actor.classId].emblem;
    elem("forecast-enemy-role").textContent=CLASS_LIBRARY[target.classId].emblem;
    elem("forecast-ally-emblem").textContent=CLASS_LIBRARY[actor.classId].emblem;
    elem("forecast-enemy-emblem").textContent=CLASS_LIBRARY[target.classId].emblem;
    elem("forecast-ally-weapon").textContent=actor.weapon.name;
    elem("forecast-enemy-weapon").textContent=target.weapon.name;
    elem("forecast-ally-odds").textContent="本次支援行动 · 无反击";
    elem("forecast-enemy-odds").textContent=label[preview.effect];
    elem("forecast-damage").textContent=preview.effect==="heal"?"+"+preview.value:String(preview.value);
    elem("forecast-counter").textContent="—";
    const after=preview.effect==="heal"?Math.min(target.maxHp,target.hp+preview.value):target.hp;
    elem("forecast-ally-hp").textContent=actor.hp+" → "+actor.hp;
    elem("forecast-enemy-hp").textContent=target.hp+" → "+after;
    for(const [id,value] of [["forecast-ally-bar",actor.hp/actor.maxHp],
      ["forecast-ally-after",actor.hp/actor.maxHp],["forecast-enemy-bar",target.hp/target.maxHp],
      ["forecast-enemy-after",after/target.maxHp]] as const)
      elem(id).style.width=Math.max(0,Math.min(100,100*value))+"%";
    const title=this.careerSupportId==="life-gift"?"生命赐福":label[preview.effect];
    elem("forecast-action-cost").textContent=title+" · 次数 -"+
      preview.cost+" · 剩余 "+preview.remaining;
    elem("forecast-confirm").textContent="确认"+title;
    this.forecastPanel.hidden=false;
  }

  private confirmAttack(): void {
    if (this.isAnimating || this.battle.phase !== "player") return;
    const attacker = this.battle.selected;
    const target = this.battle.units.find(u => u.id === this.forecastTargetId && u.hp > 0);
    if(this.supportMode){
      const preview=attacker&&target&&(this.careerSupportId?
        this.battle.previewCareerSupport(attacker,target,this.careerSupportId):
        this.battle.previewSupport(attacker,target,this.supportMode));
      if(!preview){
        this.forecastTargetId=null;this.refresh();return;
      }
      const committed=this.careerSupportId?
        this.battle.commitCareerSupport(attacker!,target!,this.careerSupportId):
        this.battle.commitSupport(attacker!,target!,this.supportMode);
      if(!committed){
        this.forecastTargetId=null;this.refresh();return;
      }
      this.forecastTargetId=null;this.attackMode=false;this.supportMode=null;
      this.careerSupportId=null;
      this.menuVisible=false;this.inspectCell(target!.x,target!.y);
      this.onCombatCommitted?.();this.refresh();this.onInspectionChange?.();
      this.onCombatPresentationEnded?.(); // support actions have no combat animation
      return;
    }
    if (!attacker || !target || !this.battle.forecastAttack(attacker, target,
      this.attackArtId??undefined)) {
      this.forecastTargetId = null;
      this.refresh();
      return;
    }
    this.forecastTargetId = null;
    this.attackMode = false;
    this.menuVisible = false;
    this.inspectCell(target.x, target.y);
    if(this.attackArtId){
      if(!this.battle.useCombatArt(attacker,target,this.attackArtId)){
        this.refresh();
        return;
      }
    }else this.battle.click(target.x,target.y);
    this.attackArtId=null;
    void this.playCombatEvents(this.battle.lastCombatEvents);
    this.onCombatCommitted?.();
    this.refresh();
    this.onInspectionChange?.();
  }

  private activateFlatCommand(command:FlatCommand,actor:Unit):void {
    if(this.isAnimating||this.battle.phase!=="player"||this.battle.selected?.id!==actor.id||
       !command.enabled)return;
    if(command.action==="wait"){
      this.battle.waitSelected();this.menuVisible=false;this.refresh();return;
    }
    if(command.action==="undo"){this.undoTentativeMove();return;}
    if(command.action==="inventory"){
      this.menuVisible=false;this.refresh();this.onInventoryRequested?.();return;
    }
    // Exactly one menu layer: the chosen skill goes straight to target selection.
    this.pickerMode=null;this.menuVisible=false;this.forecastTargetId=null;
    this.attackArtId=null;this.supportMode=null;this.careerSupportId=null;
    if(command.action==="attack"){
      this.attackMode=true;this.onHint?.("选择攻击目标");
    }else if(command.action==="art"||command.action==="career"){
      this.attackMode=true;this.attackArtId=command.artId??null;
      this.onHint?.("选择目标使用"+command.label);
    }else if(command.action==="support"&&command.effect){
      this.attackMode=true;this.supportMode=command.effect;
      this.onHint?.("选择目标使用"+command.label);
    }else if(command.action==="career-support"&&command.artId){
      this.attackMode=true;this.supportMode="heal";this.careerSupportId=command.artId;
      this.onHint?.("选择受伤友军使用"+command.label);
    }else{
      this.menuVisible=true;
    }
    this.refresh();
  }

  private renderMenu(): void {
    const actor=this.battle.selected;
    this.menu.replaceChildren();
    if(!actor||!this.menuVisible||this.attackMode||this.pickerMode||
       actor.spent||this.battle.result!=="playing"){
      this.menu.hidden=true;return;
    }
    const commands=flatBattleCommands(this.battle,actor);
    for(const cmd of commands){
      const entry=document.createElement("button");
      entry.type="button";
      entry.className="command-item"+(cmd.enabled&&cmd.group==="attack"?" command-primary":"");
      entry.textContent=cmd.icon+"　"+cmd.label;
      entry.dataset.action=cmd.action;
      entry.dataset.group=cmd.group;
      entry.disabled=!cmd.enabled;
      entry.title=cmd.hint;
      entry.addEventListener("click",()=>this.activateFlatCommand(cmd,actor));
      this.menu.appendChild(entry);
    }
    this.menu.hidden=false;
    this.positionMenu(actor);
  }

  private renderWeaponPicker(): void {
    const actor=this.battle.selected;
    const mode=this.pickerMode;
    this.weaponPicker.replaceChildren();
    if(!actor||!mode||this.isAnimating||this.battle.phase!=="player"||actor.spent){
      this.weaponPicker.hidden=true;
      return;
    }
    if(mode==="status"){
      const title=document.createElement("div");title.className="weapon-picker-title";
      title.textContent="选择黑魔法状态 · 消耗次数1";
      this.weaponPicker.appendChild(title);
      for(const [kind,name] of [
        ["burn","灼烧"],["slow","缓足"],["weakArmor","弱甲"],
        ["weakMagic","弱咒"],["mark","标记"],
      ] as const){
        const entry=document.createElement("button");entry.type="button";
        entry.className="weapon-choice";entry.textContent=name;
        entry.disabled=!this.battle.units.some(u=>this.battle.previewSupport(actor,u,kind));
        entry.addEventListener("click",()=>{
          this.supportMode=kind;this.pickerMode=null;this.attackMode=true;
          this.onHint?.("选择敌人施加"+name);this.refresh();
        });
        this.weaponPicker.appendChild(entry);
      }
      const back=document.createElement("button");back.type="button";
      back.className="weapon-back";back.textContent="返回";
      back.addEventListener("click",()=>{this.pickerMode=null;this.menuVisible=true;this.refresh();});
      this.weaponPicker.appendChild(back);this.weaponPicker.hidden=false;
      this.positionWeaponPicker(actor);return;
    }
    const title=document.createElement("div");
    title.className="weapon-picker-title";
    title.textContent=mode==="attack"?"选择攻击武器":
      mode==="art"?"选择试验战技武器 · 耗耐久3":
      mode==="formal"?"选择已装备的正式战技武器":
      mode==="career"?"选择当前职业专属招式武器":"装备背包";
    this.weaponPicker.appendChild(title);
    const attackable=new Set(mode==="career"?this.battle.availableCareerWeapons(actor):
      mode==="formal"?this.battle.availableFormalArtWeapons(actor):
      mode==="art"?this.battle.availableArtWeapons(actor):this.battle.availableAttackWeapons(actor));
    actor.inventory.forEach((id,index)=>{
      const item=WEAPON_LIBRARY[id];
      const qualified=canWield(actor.classId,id,actor.weaponExp);
      const usable=qualified&&(mode==="equip"||attackable.has(index));
      const entry=document.createElement("button");
      entry.type="button";
      entry.className="weapon-choice"+(actor.equippedIndex===index?" is-equipped":"");
      const name=document.createElement("strong");
      name.textContent=(actor.equippedIndex===index?"◆ ":"")+item.name;
      const spec=document.createElement("small");
      spec.textContent="威"+item.might+" 重"+item.weight+" 命"+item.hit+" 射"+weaponRange(item)
        +" · "+weaponResourceText(actor,index)
        +" · "+weaponExperienceText(actor.weaponExp,item.category)
        +" · 需求"+item.requiredRank;
      entry.append(name,spec);
      entry.disabled=!usable;
      entry.title=!qualified
        ? "需求"+item.requiredRank+"级熟练度，当前"+weaponRankForExp(actor.weaponExp[item.category])+
          "；请确认职业允许该类武器"
        : usable?item.name:"当前没有该武器射程内的目标";
      entry.addEventListener("click",()=>{
        if(this.isAnimating||this.battle.phase!=="player"||this.battle.selected?.id!==actor.id)return;
        if(!this.battle.equipWeapon(actor,index))return;
        this.pickerMode=null;
        if(mode==="career"){
          const skill=this.battle.currentCareerArt(actor);
          if(!skill){this.refresh();return;}
          if(skill.target==="ally"){
            this.careerSupportId=skill.id;this.supportMode="heal";
            this.attackMode=true;
            this.onHint?.("请选择受伤友军使用"+skill.name);
          }else{
            this.attackArtId=skill.id;this.attackMode=true;
            this.onHint?.("选择敌人使用"+skill.name+" · "+skill.description);
          }
        }else if(mode==="formal"){
          const skill=this.battle.formalArtForWeapon(actor);
          if(!skill){this.refresh();return;}
          if(skill.target==="ally"){
            this.supportMode="wardArmor";this.attackMode=true;
            this.onHint?.("选择友军施放"+skill.name);
          }else{
            this.attackArtId=skill.id;this.attackMode=true;
            this.onHint?.("选择敌人使用"+skill.name+" · "+skill.description);
          }
        }else if(mode==="attack"||mode==="art"){
          this.attackArtId=mode==="art"?this.battle.basicArt.id:null;
          this.attackMode=true;
          this.onHint?.(mode==="art"?"选择目标 · 试验战技消耗3耐久":"选择红色攻击目标");
        }else this.menuVisible=true;
        this.refresh();
        this.onInspectionChange?.();
      });
      this.weaponPicker.appendChild(entry);
    });
    const back=document.createElement("button");
    back.type="button";back.className="weapon-back";back.textContent="返回";
    back.addEventListener("click",()=>{
      this.pickerMode=null;this.attackArtId=null;this.careerSupportId=null;
      this.menuVisible=true;this.refresh();
    });
    this.weaponPicker.appendChild(back);
    this.weaponPicker.hidden=false;
    this.positionWeaponPicker(actor);
  }

  /** Called both when opening the picker and whenever the camera changes.
   * Move the floating screen-space panel without rebuilding its contents or state.
   */
  private touchDockInset():number {
    return window.matchMedia("(max-width: 900px), (max-height: 600px) and (pointer: coarse)").matches
      ? 82 : 8;
  }

  private positionWeaponPicker(actor: Unit): void {
    const point=tileWorld(actor.x,actor.y);
    const width=205;
    const height=this.weaponPicker.offsetHeight || Math.min(320,Math.max(0,this.viewport.clientHeight*0.8));
    const right=this.offsetX+(point.x+TILE/2)*this.zoom+10;
    const left=this.offsetX+(point.x-TILE/2)*this.zoom-width-10;
    const preferredX=right+width>this.viewport.clientWidth-8 ? left : right;
    const preferredY=this.offsetY+(point.y-TILE/2)*this.zoom-20;
    this.weaponPicker.style.left=Math.max(8,Math.min(
      this.viewport.clientWidth-width-8,preferredX))+"px";
    this.weaponPicker.style.top=Math.max(8,Math.min(
      this.viewport.clientHeight-height-this.touchDockInset(),preferredY))+"px";
  }

  private positionMenu(actor: Unit): void {
    const point = tileWorld(actor.x, actor.y);
    const menuWidth = Math.min(190,Math.max(150,this.viewport.clientWidth-16));
    const menuHeight=Math.min(this.menu.scrollHeight||300,
      this.viewport.clientHeight-this.touchDockInset()-16);
    let x = this.offsetX + (point.x + TILE / 2) * this.zoom + 10;
    let y = this.offsetY + (point.y - TILE / 2) * this.zoom - 20;
    if (x + menuWidth > this.viewport.clientWidth - 10) {
      x = this.offsetX + (point.x - TILE / 2) * this.zoom - menuWidth - 10;
    }
    x = Math.max(8, Math.min(this.viewport.clientWidth - menuWidth - 8, x));
    y = Math.max(8, Math.min(this.viewport.clientHeight - menuHeight - this.touchDockInset(), y));
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
    if (this.inspectionCell?.x === unit.x && this.inspectionCell.y === unit.y) label.classList.add("label-inspected");
    const emblem = document.createElement("span");
    emblem.className = "screen-label-emblem";
    emblem.textContent = CLASS_LIBRARY[unit.classId].emblem;
    const hp = document.createElement("span");
    hp.className = "screen-label-hp";
    const hpFill = document.createElement("span");
    hpFill.style.width = (100 * unit.hp / unit.maxHp) + "%";
    hp.appendChild(hpFill);
    const name = document.createElement("span");
    name.className = "screen-label-name";
    name.textContent = unit.name;
    label.append(emblem, hp, name);
    if(unit.statuses.length){
      const state=document.createElement("span");state.className="unit-status-count";
      state.textContent="✦"+unit.statuses.length;
      state.title=unit.statuses.map(s=>s.kind).join(" / ");
      label.appendChild(state);
    }
    return label;
  }

  private pointerDown(e:PointerEvent):void {
    if(e.pointerType==="touch"){
      if ((e.target as HTMLElement).closest(".unit-command-menu, .weapon-picker")) return;
      if(this.isAnimating || this.battle.phase!=="player") return;
      this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.touchPoints.size===2){
        const [a,b]=[...this.touchPoints.values()];
        const rect=this.viewport.getBoundingClientRect();
        const pair=touchPair(
          {x:a!.x-rect.left,y:a!.y-rect.top},
          {x:b!.x-rect.left,y:b!.y-rect.top});
        this.pinchOrigin={worldX:(pair.x-this.offsetX)/this.zoom,
          worldY:(pair.y-this.offsetY)/this.zoom,distance:pair.distance,zoom:this.zoom};
        this.drag=null;
        this.suppressClick=true;
        return;
      }
      if(this.touchPoints.size>2)return;
    }
    this.startDrag(e);
  }
  private pointerMove(e:PointerEvent):void {
    if(e.pointerType==="touch" && this.touchPoints.has(e.pointerId)){
      this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.pinchOrigin && this.touchPoints.size>=2){
        const [a,b]=[...this.touchPoints.values()];
        const rect=this.viewport.getBoundingClientRect();
        const next=pinchCamera(this.pinchOrigin,
          {x:a!.x-rect.left,y:a!.y-rect.top},
          {x:b!.x-rect.left,y:b!.y-rect.top},MIN_ZOOM,MAX_ZOOM);
        this.zoom=next.zoom;this.offsetX=next.x;this.offsetY=next.y;
        this.applyCamera();
        return;
      }
      if(this.touchPoints.size>1)return;
    }
    this.moveDrag(e);
  }
  private pointerEnd(e:PointerEvent,cancelled=false):void {
    if(e.pointerType==="touch"){
      const wasPinching=this.pinchOrigin!==null || this.touchPoints.size>1;
      this.touchPoints.delete(e.pointerId);
      if(wasPinching){
        this.pinchOrigin=null;
        this.drag=null;
        this.suppressClick=true;
        window.setTimeout(()=>{this.suppressClick=false;},0);
        return;
      }
    }
    this.finishDrag(e,cancelled);
  }

  private startDrag(e: PointerEvent): void {
    if (this.isAnimating || this.battle.phase !== "player") return;
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    if ((e.target as HTMLElement).closest(".unit-command-menu, .weapon-picker")) return;
    if (this.drag) return;
    // Right mouse dragging pans the map exactly like left dragging.
    this.drag = { pointerId: e.pointerId, button: e.button, x: e.clientX, y: e.clientY,
      offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
  }
  private moveDrag(e: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== e.pointerId || this.isAnimating) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      this.hoveredTile=null;
      this.renderRangeHighlights();
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
    if (!cancelled && !this.isAnimating && drag.button === 2 && !drag.moved) {
      const rect = this.viewport.getBoundingClientRect();
      const tile = this.hitTestScreen(e.clientX - rect.left, e.clientY - rect.top);
      this.onRightCellClick(tile?.x ?? -1, tile?.y ?? -1);
    }
    // A completed drag may not dispatch click in all browsers.
    window.setTimeout(() => { this.suppressClick = false; }, 0);
  }
  /** Movement is graphical only: engine movement/attacks are never performed per frame.
   * A step runs from one adjacent legal tile to the next with linear interpolation.
   */
  async animateMovement(unitId: string, path: readonly Point[]): Promise<void> {
    if (this.animationLocked) return;
    // Movement must remain visible on every device, regardless of OS animation preferences.
    if (path.length < 2) return;
    this.animationLocked = true;
    const epoch = ++this.animationEpoch;
    try {
      for (let index = 1; index < path.length; index++) {
        if (this.animationEpoch !== epoch) break;
        const a = path[index - 1]!;
        const b = path[index]!;
        if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) !== 1) break;
        const duration = 165;
        await new Promise<void>(resolve => {
          let start = -1;
          const frame = (timestamp: number) => {
            if (this.animationEpoch !== epoch) { resolve(); return; }
            if (start < 0) start = timestamp;
            const t = Math.min(1, (timestamp - start) / duration);
            // Ease smoothly within each grid step, without teleporting at corners.
            const eased = t * t * (3 - 2 * t);
            this.animationPose = {id: unitId,
              x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased};
            this.paintAnimationPose();
            if (t < 1) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
      }
    } finally {
      if (this.animationEpoch === epoch) {
        this.animationPose = null;
        this.animationLocked = false;
        this.refresh();
      }
    }
  }

  /** Visual playback never mutates Battle; all RNG, XP and win/loss were committed once. */
  async playCombatEvents(events: readonly CombatEvent[]): Promise<void> {
    if (!events.length) return;
    this.cancelCombatPerformance();
    const token = ++this.combatEpoch;
    this.combatPlaying = true;
    this.combatSkipRemaining = false;
    this.combatOverlay.hidden = false;
    // Display initial HP inferred from the first relevant strike, not final engine HP.
    const hp = new Map<string,number>();
    for (const event of events) {
      if (!hp.has(event.fromId)) hp.set(event.fromId,event.fromHpAfter);
      if (!hp.has(event.toId)) hp.set(event.toId,event.toHpAfter+event.damage);
    }
    try {
      for (const event of events) {
        if (token!==this.combatEpoch) return;
        const actor = this.battle.units.find(u=>u.id===event.fromId)!;
        const defender = this.battle.units.find(u=>u.id===event.toId)!;
        this.combatOverlay.replaceChildren();
        const side = (u: Unit, role: "attacker"|"defender") => {
          const node = document.createElement("div");
          node.className = "combat-performer "+role+" "+(u.team==="ally"?"ally":"enemy");
          const name = document.createElement("strong"); name.textContent=u.name;
          const badge = document.createElement("div");badge.className="combat-performer-emblem";
          badge.textContent=CLASS_LIBRARY[u.classId].emblem;
          const meter = document.createElement("div");meter.className="combat-performer-hp";
          const bar = document.createElement("span");
          bar.style.width=(100*(hp.get(u.id)??u.hp)/u.maxHp)+"%";
          meter.appendChild(bar);node.append(name,badge,meter);
          return {node,bar};
        };
        const from=side(actor,"attacker"), to=side(defender,"defender");
        const number=document.createElement("div");
        number.className="combat-floating-number "+(event.missed?"miss":event.critical?"critical":"");
        number.textContent=event.missed?"MISS":event.critical?"必杀 "+event.damage:
          event.damage===0?"0":"−"+event.damage;
        const row=document.createElement("div");row.className="combat-performers";
        row.append(from.node,number,to.node);
        this.combatOverlay.appendChild(row);
        const attackerBadge=from.node.querySelector(".combat-performer-emblem")!;
        const defenderBadge=to.node.querySelector(".combat-performer-emblem")!;
        attackerBadge.classList.add("is-striking");
        defenderBadge.classList.add(event.missed?"is-dodging":"is-hit");
        hp.set(event.toId,event.toHpAfter);
        const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // The HP bar animates after the strike motion; skip immediately sets final width.
        if(!reduced) requestAnimationFrame(()=>{to.bar.style.width=(100*event.toHpAfter/defender.maxHp)+"%";});
        else to.bar.style.width=(100*event.toHpAfter/defender.maxHp)+"%";
        await new Promise<void>(resolve=>{
          let done=false;
          const duration=reduced||this.combatSkipRemaining?0:650;
          const finish=()=>{if(done)return;done=true;window.clearTimeout(timer);
            window.removeEventListener("click",skip,true);this.skipCombatStep=null;resolve();};
          const skip=(click:MouseEvent)=>{
            click.preventDefault();click.stopImmediatePropagation();
            // One click skips the entire animation, never the combat result.
            this.combatSkipRemaining=true;
            finish();
          };
          const timer=window.setTimeout(finish,duration);
          if(duration>0) window.addEventListener("click",skip,true);
          this.skipCombatStep=finish;
        });
      }
    } finally {
      if(token===this.combatEpoch){
        this.combatPlaying=false;
        this.combatOverlay.hidden=true;
        this.combatOverlay.replaceChildren();
        this.refresh();
        // Re-enable player actions (especially the end-turn control) after playback.
        this.onCombatPresentationEnded?.();
      }
    }
  }

  skipEntireCombat(): void {
    this.combatSkipRemaining=true;
    this.skipCombatStep?.();
  }

  cancelCombatPerformance(): void {
    this.combatEpoch++;
    this.skipCombatStep?.();
    this.skipCombatStep=null;
    this.combatPlaying=false;
    this.combatSkipRemaining=false;
    if(this.combatOverlay){this.combatOverlay.hidden=true;this.combatOverlay.replaceChildren();}
  }

  cancelAnimation(): void {
    this.hoveredTile=null;
    this.cancelCombatPerformance();
    this.cancelEnemyCombatPreview();
    this.animationEpoch++;
    this.animationPose = null;
    this.animationLocked = false;
    this.refresh();
  }

  private paintAnimationPose(): void {
    const pose = this.animationPose;
    if (!pose) return;
    const point = tileWorld(pose.x, pose.y);
    const mark = this.markNodes.get(pose.id);
    if (mark) { mark.style.left = point.x + "px"; mark.style.top = point.y + "px"; }
    const label = this.labelNodes.get(pose.id);
    if (label) {
      const screen = worldScreen(point.x, point.y,
        {x: this.offsetX, y: this.offsetY, zoom: this.zoom});
      label.style.left = screen.x + "px";
      label.style.top = screen.y + "px";
    }
    const pin = this.pinNodes.get(pose.id);
    if (pin) {
      pin.style.left = point.x / WORLD_WIDTH * 100 + "%";
      pin.style.top = point.y / WORLD_HEIGHT * 100 + "%";
    }
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
      const pose = this.animationPose?.id === unit.id ? this.animationPose : unit;
      const point = tileWorld(pose.x, pose.y);
      const screen = worldScreen(point.x, point.y, camera);
      label.style.left = screen.x + "px";
      label.style.top = screen.y + "px";
      label.hidden = screen.x < -75 || screen.y < -85 || screen.x > vw + 75 || screen.y > vh + 95;
      label.classList.toggle("label-compact", this.zoom < .80);
    }
    this.paintAnimationPose();
    this.onZoomChange?.(this.zoomPercent);
    const frame = minimapFrame({x: this.offsetX, y: this.offsetY, zoom: this.zoom}, vw, vh);
    this.viewportMarker.style.left = frame.left * 100 + "%";
    this.viewportMarker.style.top = frame.top * 100 + "%";
    this.viewportMarker.style.width = frame.width * 100 + "%";
    this.viewportMarker.style.height = frame.height * 100 + "%";
    if (!this.menu.hidden && this.battle.selected) this.positionMenu(this.battle.selected);
    if (!this.weaponPicker.hidden && this.battle.selected) {
      this.positionWeaponPicker(this.battle.selected);
    }
  }

  /** Used by future pointer hit mapping and by contract tests; decorative area is non-playable. */
  hitTestScreen(localX: number, localY: number) {
    return screenTile(localX, localY, {x: this.offsetX, y: this.offsetY, zoom: this.zoom});
  }
}
