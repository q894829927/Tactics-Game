import { Battle } from "./engine/battle.ts";
import { TERRAIN_INFO, movementCostLabel } from "./engine/terrain.ts";
import { BoardView } from "./scene/BoardView.ts";
import { GAME_VERSION } from "./version.ts";
import {BASIC_KEYS,BASIC_LABELS,GROWTH_KEYS,GROWTH_LABELS} from "./engine/attributes.ts";
import {WEAPON_LIBRARY,weaponRange,canWield} from "./engine/weapons.ts";
import {weaponRankForExp,weaponExperienceText} from "./engine/proficiency.ts";
import {weaponResourceText} from "./engine/combatResources.ts";
import {CLASS_LIBRARY,effectiveClassStats,effectiveClassGrowths,type ClassId} from "./engine/classes.ts";
import {classWeaponAvailable} from "./engine/classCertification.ts";
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
board.onCombatCommitted=()=>renderSelection();
board.onCombatPresentationEnded=()=>{
  renderSelection();
  // Battle.commitAttack updates unit flags before the duel is animated;
  // do not change turns until the last visible strike has finished.
  maybeAutoEndTurn();
};
let endingTurn = false;
let turnRunId = 0;

function renderSelection(): void {
  const inspected = board.inspectionCell;
  const selected = inspected ? battle.occupant(inspected.x, inspected.y) : battle.selected;
  const terrainCode = inspected ? battle.tile(inspected.x, inspected.y)
    : selected ? battle.tile(selected.x, selected.y) : null;
  const terrain = terrainCode ? TERRAIN_INFO[terrainCode] : null;
  get("team-count").textContent = "我方 " + battle.alive("ally").length +
    " / 敌军 " + battle.alive("enemy").length;
  get("selection-title").textContent = selected ? "选中单位" : inspected ? "地形详情" : "选中单位";
  get("selection-name").textContent = selected?.name ??
    (inspected ? String.fromCharCode(65 + inspected.x) + (inspected.y + 1) + " · " + terrain?.name : "尚未选择单位");
  get("selection-role").textContent = selected ? CLASS_LIBRARY[selected.classId].name +
    (selected.team === "enemy" ? " · 敌方单位" : " · 我方单位") :
    inspected ? "空地 / 地形信息" : "左键查看单位或地形";
  get("unit-portrait").textContent = selected
    ? CLASS_LIBRARY[selected.classId].portrait
    : inspected ? terrain?.icon ?? "◇" : "♜";
  get("unit-portrait").classList.toggle("portrait-enemy", selected?.team === "enemy");
  get("unit-portrait").classList.toggle("portrait-terrain", !selected && !!inspected);
  get("hp-fill").classList.toggle("hp-enemy", selected?.team === "enemy");
  get("unit-level").textContent = selected ? "Lv."+selected.level : "Lv.—";
  get("unit-exp").textContent = selected ? "EXP "+selected.exp+"/100" : "EXP —";
  get("unit-build").textContent = selected ? String(selected.build) : "—";
  const combat = selected ? battle.combatStats(selected) : null;
  get("hp-text").textContent = selected ? selected.hp + " / " + selected.maxHp : "— / —";
  get("hp-fill").style.width = selected ? (selected.hp / selected.maxHp * 100) + "%" : "0%";
  get("stat-attack").textContent = combat ? String(combat.physicalAttack) : "—";
  get("stat-defense").textContent = combat ? String(combat.physicalProtection) : "—";
  get("stat-range").textContent = selected
    ? selected.minRange === selected.maxRange ? String(selected.minRange)
      : selected.minRange + "–" + selected.maxRange : "—";
  get("stat-move").textContent = selected ? String(selected.move) : "—";
  get("terrain-icon").textContent = terrain?.icon ?? "♠";
  get("terrain-name").textContent = terrain?.name ?? "地形信息";
  get("terrain-hint").textContent = terrain
    ? terrainCode === "#" ? "不可通行" : terrainCode === "G" ? "草地通行消耗更多移动力"
      : terrain.defense ? "地形防御加成" : "无地形防御加成"
    : "左键选择地形查看";
  get("terrain-defense").textContent = "防御 +" + (terrain?.defense ?? "—");
  get("terrain-cost").textContent = "移动消耗 " + (terrainCode ? movementCostLabel(terrainCode) : "—");
  get("weapon-name").textContent = selected
    ? selected.weapon.name+" · "+weaponResourceText(selected,selected.equippedIndex) : "—";
  const bag=get("inventory-list");
  bag.replaceChildren();
  if(selected){
    const editable=selected.team==="ally"&&battle.selected?.id===selected.id&&
      !selected.spent&&battle.phase==="player"&&!board.isAnimating;
    selected.inventory.forEach((id,index)=>{
      const weapon=WEAPON_LIBRARY[id];
      const item=document.createElement("button");
      item.type="button";
      item.className="inventory-entry"+(index===selected.equippedIndex?" equipped":"");
      const allowed=canWield(selected.classId,id,selected.weaponExp);
      item.disabled=!editable||!allowed;
      item.title=allowed?weapon.name:
        "需要"+weapon.requiredRank+"级"+weapon.category+"熟练度，当前"+
        weaponRankForExp(selected.weaponExp[weapon.category]);
      const label=document.createElement("span");
      label.textContent=(index===selected.equippedIndex?"◆ ":"")+weapon.name;
      const spec=document.createElement("small");
      spec.textContent="威"+weapon.might+" 重"+weapon.weight+" 射"+weaponRange(weapon)
        +" · "+weaponResourceText(selected,index)
        +" · "+weaponExperienceText(selected.weaponExp,weapon.category)
        +" · 需求"+weapon.requiredRank;
      item.append(label,spec);
      item.addEventListener("click",()=>{
        if(battle.equipWeapon(selected,index)){board.refresh();renderSelection();}
      });
      bag.appendChild(item);
    });
  }
  get("weapon-range").textContent = combat ? combat.range+" 格" : "—";
  const paint=(id:string,rows:readonly (readonly [string,string])[])=>{
    const root=get(id);root.replaceChildren();
    for(const [name,value] of rows){
      const line=document.createElement("div");
      const label=document.createElement("span");label.textContent=name;
      const text=document.createElement("strong");text.textContent=value;
      line.append(label,text);root.appendChild(line);
    }
  };
  const shownStats=selected?effectiveClassStats(selected.stats,selected.classId):null;
  paint("basic-attributes", BASIC_KEYS.map(k=>
    [BASIC_LABELS[k],shownStats?String(shownStats[k]):"—"] as const));
  const combatFields=[
    ["物攻","physicalAttack"],["耐物","physicalProtection"],["攻速","attackSpeed"],
    ["耐魔","magicalProtection"],["命中","hit"],["回避","avoid"],
    ["必杀","crit"],["必避","critAvoid"],["射程","range"],
  ] as const;
  paint("combat-attributes",combatFields.map(([label,key])=>
    [label,combat?String(combat[key]):"—"] as const));
  const shownGrowths=selected?effectiveClassGrowths(selected.growths,selected.classId):null;
  paint("growth-attributes",GROWTH_KEYS.map(k=>
    [GROWTH_LABELS[k],shownGrowths?shownGrowths[k]+"%":"—"] as const));
  get("selection-hint").textContent = selected?.team === "enemy"
    ? "敌军仅供查看；选中友军后点击合法目的格"
    : selected
      ? selected.spent ? "本回合已结束行动"
        : selected.moved ? "已移动：选择攻击、背包或待机；右键可撤回试移动"
        : "点击蓝色目的格移动；再次点当前角色确认原地行动"
      : inspected ? "当前地形：" + terrain?.name + "。左键查看其他格子，右键拖动地图。"
      : "选中友军，再点目的地移动；右键撤回移动。";
  button("settings-end-turn").disabled =
    battle.result !== "playing" || battle.phase !== "player" || endingTurn || board.isAnimating;
  mobileEndTurn.disabled=button("settings-end-turn").disabled;
  const canPrepare=battle.preparationOpen&&battle.phase==="player"&&
    battle.result==="playing"&&!endingTurn&&!board.isAnimating;
  button("class-preparation-button").disabled=!canPrepare;
  button("settings-preparation").disabled=!canPrepare;
  mobileCommands.textContent = battle.selected?.team==="ally" && !battle.selected.moved &&
    !battle.selected.spent ? "◎ 原地行动" : "⚔ 指令";
  mobileCommands.disabled=!(battle.selected?.team==="ally" && !battle.selected.spent &&
    battle.phase==="player" && battle.result==="playing" && !endingTurn && !board.isAnimating);
  mobileBack.disabled=battle.phase!=="player" || endingTurn || board.isAnimating;
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
battle.onChange = ()=>{
  refresh();
  // Defer until Battle.click / waitSelected and BoardView event handlers have
  // finished. A combat may start its visual playback synchronously afterward.
  queueMicrotask(maybeAutoEndTurn);
};
board.onHint = message => { get("viewport-hint").textContent = message; };
board.onInspectionChange = renderSelection;

const mobileInfo=button("mobile-info");
const mobileBack=button("mobile-back");
const mobileCommands=button("mobile-commands");
const mobileEndTurn=button("mobile-end-turn");
const mobileSidebar=get("unit-sidebar");
function setMobileInfo(open:boolean):void {
  mobileSidebar.classList.toggle("mobile-open",open);
  mobileInfo.setAttribute("aria-expanded",String(open));
  mobileSidebar.setAttribute("aria-hidden",String(!open &&
    window.matchMedia("(max-width: 900px), (max-height: 600px) and (pointer: coarse)").matches));
}
mobileInfo.addEventListener("click",()=>setMobileInfo(!mobileSidebar.classList.contains("mobile-open")));
button("mobile-sidebar-close").addEventListener("click",()=>setMobileInfo(false));
mobileBack.addEventListener("click",()=>{if(!endingTurn)board.cancelAction();renderSelection();});
mobileCommands.addEventListener("click",()=>{if(!endingTurn)board.openMobileCommands();renderSelection();});
mobileEndTurn.addEventListener("click",()=>{setMobileInfo(false);button("settings-end-turn").click();});
window.addEventListener("resize",()=>{
  mobileSidebar.setAttribute("aria-hidden",String(!mobileSidebar.classList.contains("mobile-open") &&
    window.matchMedia("(max-width: 900px), (max-height: 600px) and (pointer: coarse)").matches));
});
setMobileInfo(false);

get("minimap-grid").addEventListener("dblclick", () => board.resetCamera());


const classOverlay=get("class-preparation-overlay");
let preparationUnitId="a1";
let preparationClassId:ClassId="sword";
function closeClassPreparation():void {
  classOverlay.hidden=true;
  renderSelection();
}
function renderClassPreparation():void {
  const roster=get("class-roster"),options=get("class-options");
  roster.replaceChildren();options.replaceChildren();
  const allies=battle.units.filter(u=>u.team==="ally"&&u.hp>0);
  let actor=allies.find(u=>u.id===preparationUnitId);
  if(!actor){
    actor=allies[0];
    if(actor)preparationUnitId=actor.id;
  }
  if(!actor){closeClassPreparation();return;}
  for(const unit of allies){
    const item=document.createElement("button");
    item.type="button";
    item.className=unit.id===preparationUnitId?"active":"";
    item.textContent=unit.name+" · "+CLASS_LIBRARY[unit.classId].name;
    const sub=document.createElement("small");
    sub.textContent=unit.classId===unit.role?"已认证职业 "+unit.classLicenses.length:"职业资格";
    item.appendChild(sub);
    item.addEventListener("click",()=>{
      preparationUnitId=unit.id;preparationClassId=unit.classId;
      renderClassPreparation();
    });
    roster.appendChild(item);
  }
  if(!battle.classChoices.includes(preparationClassId))
    preparationClassId=actor.classId;
  const status=battle.classStatus(actor,preparationClassId);
  const hasWeapon=classWeaponAvailable(preparationClassId,actor.inventory,actor.weaponExp);
  for(const id of battle.classChoices){
    const cls=CLASS_LIBRARY[id],eligibility=battle.classStatus(actor,id);
    const equippable=classWeaponAvailable(id,actor.inventory,actor.weaponExp);
    const item=document.createElement("button");
    item.type="button";
    item.className=(id===preparationClassId?"active ":"")+
      (eligibility.eligible&&equippable?"":"locked");
    const headline=document.createElement("strong");
    headline.textContent=cls.emblem+" "+cls.name+" · "+
      (cls.tier==="basic"?"初级":"中级");
    const detail=document.createElement("small");
    detail.textContent=id===actor.classId?"当前职业":
      !eligibility.eligible?eligibility.reason:
      !equippable?"没有可用的训练武器":eligibility.reason;
    item.append(headline,detail);
    item.addEventListener("click",()=>{preparationClassId=id;renderClassPreparation();});
    options.appendChild(item);
  }
  const cls=CLASS_LIBRARY[preparationClassId];
  const changes=Object.entries(cls.statModifiers).map(([k,v])=>
    (BASIC_LABELS as Record<string,string>)[k]+" "+(Number(v)>=0?"+":"")+v).join(" · ");
  const growth=Object.entries(cls.growthModifiers).map(([k,v])=>
    (GROWTH_LABELS as Record<string,string>)[k]+"成长 "+
    (Number(v)>=0?"+":"")+v+"%").join(" · ");
  const req=Object.entries(cls.requiredWeaponRanks).map(([k,v])=>k+" "+v).join("、");
  get("class-preparation-details").textContent=
    actor.name+" → "+cls.name+"｜武器要求："+req+
    "｜能力："+(changes||"无修正")+"｜成长："+(growth||"无修正")+
    "｜"+(status.eligible?(hasWeapon?"资格满足":"无可用训练装备"):status.reason)+
    "。个人属性、等级与熟练度不会因转职改变。"+
    (cls.tier!=="basic"?"中级职业须有名声、考试凭证和金币；目前尚无获取入口。":"");
  const canApply=battle.canPrepareClass(actor)&&status.eligible&&hasWeapon&&
    preparationClassId!==actor.classId;
  button("class-preparation-confirm").disabled=!canApply;
}
function openClassPreparation():void {
  if(!battle.preparationOpen||battle.phase!=="player"||
      battle.result!=="playing"||endingTurn||board.isAnimating)return;
  setSettings(false);setMobileInfo(false);board.hideCommandMenu();
  const selected=battle.selected;
  preparationUnitId=selected?.team==="ally"?selected.id:preparationUnitId;
  const actor=battle.units.find(u=>u.id===preparationUnitId);
  preparationClassId=actor?.classId??"sword";
  classOverlay.hidden=false;
  renderClassPreparation();
  button("class-preparation-close").focus();
}
button("class-preparation-button").addEventListener("click",openClassPreparation);
button("settings-preparation").addEventListener("click",openClassPreparation);
button("class-preparation-close").addEventListener("click",closeClassPreparation);
button("class-preparation-cancel").addEventListener("click",closeClassPreparation);
classOverlay.addEventListener("click",e=>{
  if(e.target===classOverlay)closeClassPreparation();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!classOverlay.hidden)closeClassPreparation();
});
button("class-preparation-confirm").addEventListener("click",()=>{
  const actor=battle.units.find(u=>u.id===preparationUnitId);
  if(!actor||!battle.changeClass(actor.id,preparationClassId)){
    renderClassPreparation();return;
  }
  board.refresh();renderSelection();renderClassPreparation();
});

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
function showPhase(title: string, english: string, duration = 1250): void {
  const banner = get("phase-banner");
  window.clearTimeout(phaseTimeout);
  get("phase-label").textContent = title;
  get("phase-caption").textContent = english;
  banner.hidden = false;
  banner.classList.toggle("phase-enemy", english === "ENEMY PHASE");
  banner.classList.remove("phase-animate");
  void banner.offsetWidth;
  banner.classList.add("phase-animate");
  phaseTimeout = window.setTimeout(() => { banner.hidden = true; }, duration);
}

const pause = (ms: number) => new Promise<void>(resolve => {
  enemyTurnTimeout = window.setTimeout(() => {
    enemyTurnTimeout = undefined;
    resolve();
  }, ms);
});
/** Both manual and automatic endings enter this single guarded sequence.
 * The manual button still allows ending before all allies have acted.
 */
function startEnemyTurn(): void {
  if (endingTurn || board.isAnimating || battle.phase !== "player" ||
      battle.result !== "playing") return;
  endingTurn = true;
  setMobileInfo(false);
  const run = ++turnRunId;
  setSettings(false);
  board.hideCommandMenu();
  renderSelection();
  showPhase("第 " + battle.round + " 回合 · 敌方行动", "ENEMY PHASE", 650);
  void (async () => {
    await pause(650);
    if (run !== turnRunId || !battle.beginEnemyTurn()) return;
    while (run === turnRunId && battle.result === "playing") {
      const plan = battle.planEnemyAction();
      if (!plan) break;
      await board.animateMovement(plan.unitId, plan.path);
      if (run !== turnRunId) return;
      board.holdUnitAt(plan.unitId, plan.destination);
      // Only attacking enemies show the 5-second combat panel. A single click
      // closes the panel early but still executes the attack exactly once.
      if (plan.targetId) await board.showEnemyCombatPreview(plan, 5000);
      if (run !== turnRunId) return;
      board.releaseUnitHold();
      if (!battle.commitEnemyAction(plan)) break;
      if (plan.targetId) await board.playCombatEvents(battle.lastCombatEvents);
      if (run !== turnRunId) return;
      // Show each enemy's finished move/attack before the next enemy acts.
      await pause(320);
    }
    if (run !== turnRunId) return;
    battle.finishEnemyTurn();
    endingTurn = false;
    refresh();
    if (battle.result === "playing")
      showPhase("第 " + battle.round + " 回合 · 我方行动", "PLAYER PHASE");
  })();
}

function maybeAutoEndTurn(): void {
  if (endingTurn || board.isAnimating || !battle.allLivingAlliesSpent) return;
  startEnemyTurn();
}

button("settings-end-turn").addEventListener("click", startEnemyTurn);
button("restart-button").addEventListener("click", () => {
  if (!window.confirm("重新开始关卡？当前进度将丢失。")) return;
  // Invalidate an in-flight enemy turn and any active interpolation first.
  turnRunId++;
  board.cancelAnimation();
  endingTurn = false;
  battle.restart();
  board.clearInspection();
  board.resetCamera();
  setMobileInfo(false);
  setSettings(false);
  showPhase("第 1 回合 · 我方行动", "PLAYER PHASE");
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!overlay.hidden) setSettings(false);
    else if (!endingTurn) board.cancelAction();
  }
  if (!overlay.hidden || event.target instanceof HTMLInputElement) return;
  if (event.key === "+" || event.key === "=") board.zoomBy(1.18);
  if (event.key === "-") board.zoomBy(1 / 1.18);
  if (event.key.toLowerCase() === "m") board.resetCamera();
});
refresh();
showPhase("第 1 回合 · 我方行动", "PLAYER PHASE");
