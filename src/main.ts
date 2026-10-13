import { Battle, type Unit } from "./engine/battle.ts";
import { BoardView } from "./scene/BoardView.ts";
import { GAME_VERSION } from "./version.ts";
import "./style.css";

const get = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing UI element: " + id);
  return element;
};
const button = (id: string): HTMLButtonElement => get(id) as HTMLButtonElement;
get("game-version").textContent = GAME_VERSION;
const battle = new Battle();
const board = new BoardView(battle, get("game"));

const roleNames: Record<Unit["role"], string> = {
  sword: "剑士", lancer: "枪卫", archer: "弓手",
  mage: "术士", raider: "步兵", commander: "指挥官",
};
const weapons: Record<Unit["role"], string> = {
  sword: "长剑", lancer: "长枪", archer: "弓", mage: "法杖",
  raider: "短斧", commander: "指挥剑",
};
const terrainInfo: Record<string, { name: string; icon: string; defense: number; cost: string }> = {
  ".": { name: "平地", icon: "◇", defense: 0, cost: "1" },
  F: { name: "森林", icon: "♠", defense: 1, cost: "2" },
  H: { name: "丘陵", icon: "▲", defense: 1, cost: "2" },
  "#": { name: "峭壁", icon: "▥", defense: 0, cost: "不可通行" },
};

function renderSelection(): void {
  const inspected = board.inspectionCell;
  const selected = inspected ? battle.occupant(inspected.x, inspected.y) : battle.selected;
  const terrainCode = inspected ? battle.tile(inspected.x, inspected.y)
    : selected ? battle.tile(selected.x, selected.y) : null;
  const terrain = terrainCode ? terrainInfo[terrainCode]! : null;
  get("team-count").textContent = "我方 " + battle.alive("ally").length +
    " / 敌军 " + battle.alive("enemy").length;
  get("selection-title").textContent = selected ? "选中单位" : inspected ? "地形详情" : "选中单位";
  get("selection-name").textContent = selected?.name ??
    (inspected ? String.fromCharCode(65 + inspected.x) + (inspected.y + 1) + " · " + terrain?.name : "尚未选择单位");
  get("selection-role").textContent = selected ? roleNames[selected.role] +
    (selected.team === "enemy" ? " · 敌方单位" : " · 我方单位") :
    inspected ? "空地 / 地形信息" : "左键查看单位或地形";
  get("unit-portrait").textContent = selected
    ? ({ sword: "⚔", lancer: "♞", archer: "➶", mage: "✦", raider: "⚔", commander: "♜" }[selected.role])
    : inspected ? terrain?.icon ?? "◇" : "♜";
  get("unit-portrait").classList.toggle("portrait-enemy", selected?.team === "enemy");
  get("unit-portrait").classList.toggle("portrait-terrain", !selected && !!inspected);
  get("hp-fill").classList.toggle("hp-enemy", selected?.team === "enemy");
  get("hp-text").textContent = selected ? selected.hp + " / " + selected.maxHp : "— / —";
  get("hp-fill").style.width = selected ? (selected.hp / selected.maxHp * 100) + "%" : "0%";
  get("stat-attack").textContent = selected ? String(selected.attack) : "—";
  get("stat-defense").textContent = selected ? String(selected.defense) : "—";
  get("stat-range").textContent = selected
    ? selected.minRange === selected.maxRange ? String(selected.minRange)
      : selected.minRange + "–" + selected.maxRange : "—";
  get("stat-move").textContent = selected ? String(selected.move) : "—";
  get("terrain-icon").textContent = terrain?.icon ?? "♠";
  get("terrain-name").textContent = terrain?.name ?? "地形信息";
  get("terrain-hint").textContent = terrain
    ? terrainCode === "#" ? "不可通行" : terrain.defense ? "地形防御加成" : "无地形防御加成"
    : "左键选择地形查看";
  get("terrain-defense").textContent = "防御 +" + (terrain?.defense ?? "—");
  get("terrain-cost").textContent = "移动消耗 " + (terrain?.cost ?? "—");
  get("weapon-name").textContent = selected ? weapons[selected.role] : "—";
  get("weapon-range").textContent = selected
    ? selected.minRange + (selected.maxRange !== selected.minRange ? "–" + selected.maxRange : "") + " 格" : "—";
  get("selection-hint").textContent = selected?.team === "enemy"
    ? "敌军信息仅供查看；选中我方单位后右键打开行动菜单"
    : selected
      ? selected.spent ? "本回合已结束行动"
        : selected.moved ? "已移动：右键该单位选择攻击或待机"
        : "左键选中与移动；右键该单位打开指令，移动后可取消"
      : inspected ? "当前地形：" + terrain?.name + "。左键查看其他格子，右键拖动地图。"
      : "左键查看地形或选择单位；右键点击友军打开指令。";
  button("settings-end-turn").disabled = battle.result !== "playing";
}

function refresh(): void {
  board.refresh();
  renderSelection();
  const result = get("result-banner");
  result.hidden = battle.result === "playing";
  result.textContent = battle.result === "victory"
    ? "胜利！赤旗统领被击败。" : battle.result === "defeat"
    ? "挑战失败：全体友军倒下。" : "";
  const logs = get("log-list");
  logs.replaceChildren();
  for (const line of [...battle.log].reverse()) {
    const item = document.createElement("li");
    const icon = document.createElement("span");
    icon.className = "log-icon";
    icon.textContent = line.includes("敌方") || line.includes("逼近") || line.includes("反击") ? "⚔" : "◇";
    item.className = icon.textContent === "⚔" ? "log-enemy" : "log-friendly";
    item.append(icon, document.createTextNode(line));
    logs.appendChild(item);
  }
}
battle.onChange = refresh;
board.onHint = message => { get("viewport-hint").textContent = message; };
board.onInspectionChange = renderSelection;

get("minimap-grid").addEventListener("dblclick", () => board.resetCamera());

const overlay = get("settings-overlay");
function setSettings(open: boolean): void {
  overlay.hidden = !open;
  button("settings-button").setAttribute("aria-expanded", String(open));
  if (open) button("close-settings").focus();
  else button("settings-button").focus();
}
button("settings-button").addEventListener("click", () => setSettings(true));
button("close-settings").addEventListener("click", () => setSettings(false));
overlay.addEventListener("click", event => { if (event.target === overlay) setSettings(false); });
button("reset-view").addEventListener("click", () => { board.resetCamera(); setSettings(false); });

let phaseTimeout: number | undefined;
let enemyTurnTimeout: number | undefined;
let endingTurn = false;
function showPhase(title: string, english: string, duration = 1250): void {
  const banner = get("phase-banner");
  window.clearTimeout(phaseTimeout);
  get("phase-label").textContent = title;
  get("phase-caption").textContent = english;
  banner.hidden = false;
  banner.classList.remove("phase-animate");
  void banner.offsetWidth;
  banner.classList.add("phase-animate");
  phaseTimeout = window.setTimeout(() => { banner.hidden = true; }, duration);
}

button("settings-end-turn").addEventListener("click", () => {
  if (endingTurn || battle.result !== "playing") return;
  endingTurn = true;
  setSettings(false);
  board.hideCommandMenu();
  showPhase("第 " + battle.round + " 回合 · 敌方行动", "ENEMY PHASE", 850);
  enemyTurnTimeout = window.setTimeout(() => {
    enemyTurnTimeout = undefined;
    battle.endTurn();
    endingTurn = false;
    if (battle.result === "playing") {
      showPhase("第 " + battle.round + " 回合 · 我方行动", "PLAYER PHASE");
    }
  }, 860);
});
button("restart-button").addEventListener("click", () => {
  if (!window.confirm("重新开始关卡？当前进度将丢失。")) return;
  window.clearTimeout(enemyTurnTimeout);
  enemyTurnTimeout = undefined;
  endingTurn = false;
  battle.restart();
  board.resetCamera();
  setSettings(false);
  showPhase("第 1 回合 · 我方行动", "PLAYER PHASE");
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!overlay.hidden) setSettings(false);
    else board.cancelAction();
  }
  if (!overlay.hidden || event.target instanceof HTMLInputElement) return;
  if (event.key === "+" || event.key === "=") board.zoomBy(1.18);
  if (event.key === "-") board.zoomBy(1 / 1.18);
  if (event.key.toLowerCase() === "m") board.resetCamera();
});
refresh();
showPhase("第 1 回合 · 我方行动", "PLAYER PHASE");
