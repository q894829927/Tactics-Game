import { Battle } from "./engine/battle.ts";
import {CAMPAIGN_STORAGE_KEY,readCampaignJson,ALLY_IDS,type AllyId} from "./engine/campaign.ts";
import { TERRAIN_INFO, movementCostLabel } from "./engine/terrain.ts";
import { BoardView } from "./scene/BoardView.ts";
import { GAME_VERSION } from "./version.ts";
import {BASIC_KEYS,BASIC_LABELS,GROWTH_KEYS,GROWTH_LABELS} from "./engine/attributes.ts";
import {WEAPON_LIBRARY,weaponRange,canWield} from "./engine/weapons.ts";
import {weaponRankForExp,weaponExperienceText,WEAPON_RANK_THRESHOLDS} from "./engine/proficiency.ts";
import {weaponResourceText} from "./engine/combatResources.ts";
import {CLASS_LIBRARY,effectiveClassStats,effectiveClassGrowths,type ClassId} from "./engine/classes.ts";
import {classWeaponAvailable,certificationRequirements} from "./engine/classCertification.ts";
import "./style.css";

const get = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing UI element: " + id);
  return element;
};
const button = (id: string): HTMLButtonElement => get(id) as HTMLButtonElement;
get("game-version").textContent = GAME_VERSION;
const storedText=(()=>{try{return localStorage.getItem(CAMPAIGN_STORAGE_KEY);}catch{return null;}})();
const loadedCampaign=readCampaignJson(storedText);
const battle=new Battle({campaign:true,save:loadedCampaign});
let campaignSelectedId:AllyId="a1";
let saveStatus=storedText&&!loadedCampaign
  ?"旧存档不可识别，已开启新队伍。":"队伍进度保存在当前浏览器。";
const board = new BoardView(battle, get("game"));
board.onCombatCommitted=()=>renderSelection();
board.onCombatPresentationEnded=()=>{
  renderSelection();
  renderCampaign();
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
    battle.result !== "playing" || battle.phase !== "player" ||
    battle.campaignStage!=="battle" || endingTurn || board.isAnimating;
  mobileEndTurn.disabled=button("settings-end-turn").disabled;
  const canPrepare=battle.preparationOpen&&battle.phase==="player"&&
    battle.result==="playing"&&!endingTurn&&!board.isAnimating;
  button("class-preparation-button").disabled=!canPrepare;
  button("settings-preparation").disabled=!canPrepare;
  mobileCommands.textContent = battle.selected?.team==="ally" && !battle.selected.moved &&
    !battle.selected.spent ? "◎ 原地行动" : "⚔ 指令";
  mobileCommands.disabled=!(battle.selected?.team==="ally" && !battle.selected.spent &&
    battle.phase==="player" && battle.result==="playing" &&
    battle.campaignStage==="battle" && !endingTurn && !board.isAnimating);
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
  if(battle.campaignStage!=="battle")saveCampaignProgress();
  renderCampaign();
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


function saveCampaignProgress():void{
  try{
    localStorage.setItem(CAMPAIGN_STORAGE_KEY,JSON.stringify(battle.campaignSnapshot()));
    saveStatus="队伍进度已保存在本机。";
  }catch{saveStatus="浏览器存储不可用：刷新可能丢失成长。";}
}
function renderCampaign():void{
  const preparing=battle.campaignStage==="preparation";
  const settling=battle.campaignStage==="settlement"&&!board.isAnimating&&!endingTurn;
  get("campaign-preparation-overlay").hidden=!preparing;
  get("campaign-settlement-overlay").hidden=!settling;
  if(preparing){
    const roster=get("campaign-roster"),equipment=get("campaign-equipment");
    roster.replaceChildren();equipment.replaceChildren();
    get("campaign-sortie-number").textContent="第 "+(battle.sortiesCompleted+1)+" 次出击";
    get("campaign-gold").textContent=String(battle.preparationFunds.gold);
    get("campaign-reputation").textContent=String(battle.preparationFunds.reputation);
    get("campaign-intermediate-vouchers").textContent=
      String(battle.preparationFunds.vouchers.intermediate);
    for(const id of ALLY_IDS){
      const ally=battle.units.find(u=>u.id===id)!;
      const item=document.createElement("button");
      item.type="button";
      item.className="campaign-unit"+(id===campaignSelectedId?" selected":"");
      item.setAttribute("aria-pressed",String(id===campaignSelectedId));
      item.textContent=ally.name+" · "+CLASS_LIBRARY[ally.classId].name+" · Lv."+ally.level;
      item.addEventListener("click",()=>{campaignSelectedId=id;renderCampaign();});
      roster.appendChild(item);
    }
    const selected=battle.units.find(u=>u.id===campaignSelectedId)!;
    const heading=document.createElement("h3");
    heading.textContent=selected.name+" · 出击装备";
    equipment.appendChild(heading);
    selected.inventory.forEach((id,index)=>{
      const item=document.createElement("button");
      item.type="button";item.className="campaign-weapon"+
        (selected.equippedIndex===index?" selected":"");
      item.disabled=!canWield(selected.classId,id,selected.weaponExp);
      item.textContent=(selected.equippedIndex===index?"◆ ":"")+
        WEAPON_LIBRARY[id].name+" · "+weaponResourceText(selected,index);
      item.addEventListener("click",()=>{battle.prepareEquipWeapon(selected.id,index);});
      equipment.appendChild(item);
    });
    get("campaign-save-status").textContent=saveStatus;
  }
  if(settling){
    const outcome=battle.pendingSettlement;
    if(outcome){
      get("campaign-settlement-result").textContent=
        (outcome.result==="victory"?"战斗胜利":"战斗失败")+
        " · 第 "+outcome.sortie+" 次出击";
      get("campaign-reward-gold").textContent="+"+outcome.reward.gold;
      get("campaign-reward-reputation").textContent="+"+outcome.reward.reputation;
      get("campaign-reward-vouchers").textContent=
        "+"+outcome.reward.vouchers.intermediate;
      const rows=get("campaign-settlement-roster");rows.replaceChildren();
      for(const unit of outcome.units){
        const row=document.createElement("div");row.className="campaign-settlement-row";
        const label=document.createElement("strong");label.textContent=unit.name;
        const stats=document.createElement("span");
        stats.textContent="Lv."+unit.levelBefore+" → "+unit.levelAfter+
          " · EXP "+unit.experienceBefore+" → "+unit.experienceAfter+
          " · 武器经验 +"+unit.weaponExpGained;
        row.append(label,stats);rows.appendChild(row);
      }
    }
  }
}
button("campaign-change-class").addEventListener("click",()=>{
  preparationUnitId=campaignSelectedId;openClassPreparation();
});
button("campaign-start-sortie").addEventListener("click",()=>{
  if(battle.beginSortie())showPhase("第 1 回合 · 我方行动","PLAYER PHASE");
});
button("campaign-return-preparation").addEventListener("click",()=>{
  if(battle.returnToPreparation()){
    board.clearInspection();board.resetCamera();
    refresh();renderCampaign();
  }
});
button("campaign-reset-save").addEventListener("click",()=>{
  if(!window.confirm("永久清除全部队伍成长与职业认证？"))return;
  try{localStorage.removeItem(CAMPAIGN_STORAGE_KEY);}catch{/* unsupported */}
  battle.resetCampaign();campaignSelectedId="a1";
  saveStatus="队伍进度已重置。";refresh();renderCampaign();
});

const classOverlay=get("class-preparation-overlay");
let preparationUnitId="a1";
let preparationClassId:ClassId="sword";
let classStatMode:"stats"|"growth"="stats";

const CLASS_TIER_NAMES={basic:"初级",intermediate:"中级",advanced:"上级",
  master:"最上级",legacy:"传承"} as const;
const CLASS_DESCRIPTIONS:Partial<Record<ClassId,string>>={
  sword:"灵活的近战剑士，利用速度优势进行连续攻击。",
  lancer:"擅长枪术的前排战士，使用长枪克制骑乘目标。",
  axeFighter:"以重斧作战的力量型战士，命中后具有最低伤害保障。",
  archer:"擅长远程攻击的射手，对飞行目标具有武器威力特效。",
  brawler:"使用轻巧拳套的近战战士，面对其他武器攻击时更容易闪避。",
  mage:"运用黑魔法攻击敌人，以魔力对抗目标的魔防。",
  acolyte:"掌握攻击型白魔法的施法者，治疗与辅助法术尚未开放。",
  duelist:"熟练运用剑术的进阶职业，拥有更高的速度补正。",
  sentinel:"重视防御的进阶枪术职业，拥有更高的防守补正。",
};
const WEAPON_TRAIT_LABELS={
  sword:"剑系追击伤害 ×1.2",lance:"对骑乘目标武器威力 ×2",
  axe:"斧命中伤害至少 5",bow:"对飞行目标武器威力 ×3",
  gauntlet:"受非拳套攻击时回避 +15",dark:"黑魔法按魔防结算",
  white:"攻击型白魔法按魔防结算",
} as const;
const CLASS_SYMBOLS={
  sword:"⚔",lance:"♞",axe:"⚒",bow:"➶",gauntlet:"✊",dark:"✦",white:"✧",
} as const;
function closeClassPreparation():void {
  classOverlay.hidden=true;
  renderSelection();
}
function renderClassPreparation():void {
  const roster=get("class-roster"),options=get("class-options");
  const oldScroll=options.scrollTop;
  roster.replaceChildren();options.replaceChildren();
  const allies=battle.units.filter(u=>u.team==="ally"&&u.hp>0);
  let actor=allies.find(u=>u.id===preparationUnitId);
  if(!actor){actor=allies[0];if(actor)preparationUnitId=actor.id;}
  if(!actor){closeClassPreparation();return;}
  for(const unit of allies){
    const cls=CLASS_LIBRARY[unit.classId];
    const item=document.createElement("button");
    item.type="button";
    item.className="class-roster-card"+(unit.id===preparationUnitId?" active":"");
    item.setAttribute("aria-pressed",String(unit.id===preparationUnitId));
    const portrait=document.createElement("span");
    portrait.className="class-roster-portrait";
    portrait.textContent=cls.portrait;
    portrait.setAttribute("aria-hidden","true");
    const identity=document.createElement("span");identity.className="class-roster-identity";
    const label=document.createElement("strong");label.textContent=unit.name;
    const sub=document.createElement("small");
    sub.textContent="当前职业："+cls.name+" · Lv."+unit.level;
    identity.append(label,sub);
    const icon=document.createElement("span");icon.className="class-roster-crest";
    icon.textContent=cls.emblem;icon.setAttribute("aria-hidden","true");
    item.append(portrait,identity,icon);
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
    const isCurrent=id===actor.classId;
    const item=document.createElement("button");item.type="button";
    item.className="class-option-card"+(id===preparationClassId?" active":"")+
      (!eligibility.eligible||!equippable?" locked":"");
    item.setAttribute("aria-pressed",String(id===preparationClassId));
    const symbol=document.createElement("span");symbol.className="class-option-icon";
    symbol.textContent=CLASS_SYMBOLS[cls.weaponCategories[0]]??cls.emblem;
    const info=document.createElement("span");info.className="class-option-identity";
    const headline=document.createElement("strong");
    headline.textContent=cls.name+" · "+CLASS_TIER_NAMES[cls.tier];
    const caption=document.createElement("small");
    const label=isCurrent?"当前职业":eligibility.alreadyCertified?"已认证":
      !eligibility.eligible||!equippable?"资格不足":"可转职";
    caption.textContent=label;
    info.append(headline,caption);
    const flag=document.createElement("span");
    flag.className="class-option-status "+(isCurrent?"is-current":
      eligibility.alreadyCertified?"is-certified":
      eligibility.eligible&&equippable?"is-ready":"is-locked");
    flag.textContent=isCurrent?"◆":eligibility.alreadyCertified?"✓":
      eligibility.eligible&&equippable?"✓":"🔒";
    flag.setAttribute("aria-label",label);
    item.append(symbol,info,flag);
    item.title=isCurrent?"当前职业":eligibility.eligible&&equippable?eligibility.reason:
      !eligibility.eligible?eligibility.reason:"缺少可用武器";
    item.addEventListener("click",()=>{preparationClassId=id;renderClassPreparation();});
    options.appendChild(item);
  }
  options.scrollTop=oldScroll;
  const cls=CLASS_LIBRARY[preparationClassId];
  const symbol=CLASS_SYMBOLS[cls.weaponCategories[0]]??cls.emblem;
  get("class-preview-emblem").textContent=symbol;
  get("class-preview-silhouette").textContent=symbol;
  get("class-preview-name").textContent=cls.name+" · "+CLASS_TIER_NAMES[cls.tier];
  get("class-preview-description").textContent=CLASS_DESCRIPTIONS[preparationClassId]??"职业介绍尚未开放。";
  const badges=get("class-preview-badges");
  badges.replaceChildren();
  for(const [label,kind] of [
    [CLASS_TIER_NAMES[cls.tier]+"职业","tier"],
    [preparationClassId===actor.classId?"当前职业":
      status.alreadyCertified?"已认证":status.eligible&&hasWeapon?"可认证":"未解锁",
      preparationClassId===actor.classId||status.alreadyCertified?"certified":
      status.eligible&&hasWeapon?"ready":"locked"],
  ]){
    const tag=document.createElement("span");
    tag.className="class-state-tag "+kind;tag.textContent=label??"";
    badges.appendChild(tag);
  }

  const statsMode=classStatMode==="stats";
  button("class-tab-stats").classList.toggle("active",statsMode);
  button("class-tab-growth").classList.toggle("active",!statsMode);
  button("class-tab-stats").setAttribute("aria-pressed",String(statsMode));
  button("class-tab-growth").setAttribute("aria-pressed",String(!statsMode));
  get("class-stats-title").textContent=statsMode?"基础能力对比":"成长值对比";
  const currentStats=effectiveClassStats(actor.stats,actor.classId);
  const afterStats=effectiveClassStats(actor.stats,preparationClassId);
  const currentGrowth=effectiveClassGrowths(actor.growths,actor.classId);
  const afterGrowth=effectiveClassGrowths(actor.growths,preparationClassId);
  // Grid is row-major: every consecutive pair is one physical row.
  // Keep the same layout in growth view; movement has no growth rate.
  const statRows:readonly (readonly [string,number|null,number|null])[]=statsMode?[
    ["HP",actor.maxHp,actor.maxHp],["移动力",actor.move,actor.move],
    ["力量",currentStats.strength,afterStats.strength],["防守",currentStats.defense,afterStats.defense],
    ["魔力",currentStats.magic,afterStats.magic],["魔防",currentStats.resistance,afterStats.resistance],
    ["速度",currentStats.speed,afterStats.speed],["幸运",currentStats.luck,afterStats.luck],
    ["技巧",currentStats.dexterity,afterStats.dexterity],["魅力",currentStats.charm,afterStats.charm],
  ]:[
    ["HP",currentGrowth.hp,afterGrowth.hp],["移动力",null,null],
    ["力量",currentGrowth.strength,afterGrowth.strength],["防守",currentGrowth.defense,afterGrowth.defense],
    ["魔力",currentGrowth.magic,afterGrowth.magic],["魔防",currentGrowth.resistance,afterGrowth.resistance],
    ["速度",currentGrowth.speed,afterGrowth.speed],["幸运",currentGrowth.luck,afterGrowth.luck],
    ["技巧",currentGrowth.dexterity,afterGrowth.dexterity],["魅力",currentGrowth.charm,afterGrowth.charm],
  ];
  const statsRoot=get("class-stat-grid");statsRoot.replaceChildren();
  for(const [label,before,after] of statRows){
    const row=document.createElement("div");
    row.className="class-stat-row";
    const name=document.createElement("span");name.className="class-stat-label";name.textContent=label;
    const from=document.createElement("span");from.className="class-stat-before";
    const format=(value:number|null)=>value===null?"—":String(value)+(statsMode?"":"%");
    from.textContent=format(before);
    const arrow=document.createElement("span");arrow.className="class-stat-arrow";
    arrow.textContent=before===null?"":"›";
    const dest=document.createElement("strong");
    dest.className="class-stat-after "+(before!==null&&after!==null&&after>before?"increased":
      before!==null&&after!==null&&after<before?"decreased":"unchanged");
    // Keep the comparison number and ▲/▼ in different grid tracks:
    // changing trend indicators must never shift either number or the › glyph.
    dest.textContent=format(after);
    const trend=document.createElement("span");
    trend.className="class-stat-trend";
    const direction=before!==null&&after!==null
      ? after>before?"up":after<before?"down":"none" : "none";
    trend.textContent=direction==="up"?"▲":direction==="down"?"▼":"";
    trend.setAttribute("aria-label",direction==="up"?"提升":direction==="down"?"下降":"无变化");
    row.append(name,from,arrow,dest,trend);statsRoot.appendChild(row);
  }
  const requirementsRoot=get("class-requirement-list");
  requirementsRoot.replaceChildren();
  for(const [category,required] of Object.entries(cls.requiredWeaponRanks)){
    if(!required)continue;
    const kind=category as keyof typeof actor.weaponExp;
    const xp=actor.weaponExp[kind];
    const current=weaponRankForExp(xp);
    const passed=xp>=WEAPON_RANK_THRESHOLDS[required as keyof typeof WEAPON_RANK_THRESHOLDS];
    const chip=document.createElement("div");
    chip.className="class-requirement-chip "+(passed?"met":"unmet");
    const emblem=document.createElement("span");
    emblem.className="class-requirement-icon";
    emblem.textContent=CLASS_SYMBOLS[kind]??"◆";
    emblem.setAttribute("aria-hidden","true");
    const title=document.createElement("span");
    title.className="class-requirement-text";
    title.textContent=({sword:"剑术",lance:"枪术",axe:"斧术",bow:"弓术",
      gauntlet:"拳术",dark:"黑魔法",white:"白魔法"} as Record<string,string>)[category]??category;
    const rank=document.createElement("strong");
    rank.textContent=required;
    const progress=document.createElement("small");
    progress.textContent="当前 "+current+(passed?" ✓":" · 未达到");
    chip.append(emblem,title,rank,progress);
    chip.title=title.textContent+"需求 "+required+"，当前 "+current;
    requirementsRoot.appendChild(chip);
  }
  get("class-preview-trait").textContent=
    WEAPON_TRAIT_LABELS[cls.weaponCategories[0]]??"暂无可用的武器系规则";
  get("class-preview-mastery").textContent=
    cls.masteryRewardIds.length>0?cls.masteryRewardIds.join(" · "):
    "尚未开放 · C3 职业精通";

  const exam=get("class-exam-panel"),examContent=get("class-exam-content");
  examContent.replaceChildren();
  const needsExam=cls.tier==="intermediate"&&!status.alreadyCertified;
  exam.hidden=!needsExam;
  if(needsExam){
    const requirements=certificationRequirements(preparationClassId);
    const funds=battle.preparationFunds;
    const conditions:([string,string,boolean])[]=[];
    conditions.push(["名声 ≥"+requirements.reputation,"当前 "+funds.reputation,
      funds.reputation>=requirements.reputation]);
    conditions.push(["金币 ×"+requirements.gold,"持有 "+funds.gold,
      funds.gold>=requirements.gold]);
    if(requirements.voucher)
      conditions.push(["中级考试凭证 ×1","持有 "+funds.vouchers[requirements.voucher],
        funds.vouchers[requirements.voucher]>0]);
    for(const [label,value,met] of conditions){
      const row=document.createElement("div");
      row.className="class-exam-row "+(met?"met":"unmet");
      const name=document.createElement("span");name.textContent=label;
      const qty=document.createElement("span");qty.textContent=value;
      const marker=document.createElement("b");marker.textContent=met?"✓":"–";
      row.append(name,qty,marker);examContent.appendChild(row);
    }
  }
  const abilityNotes=Object.entries(cls.statModifiers).map(([key,value])=>
    (BASIC_LABELS as Record<string,string>)[key]+" "+(Number(value)>=0?"+":"")+value);
  get("class-preparation-details").textContent=
    actor.name+" → "+cls.name+"。"+
    (abilityNotes.length?abilityNotes.join("、"):"职业属性无修正")+"。"+
    (status.eligible&&hasWeapon?"资格满足":status.reason)+"。"+
    "个人属性、等级、熟练度不会因转职被重置。";
  button("class-preparation-confirm").disabled=
    !battle.canPrepareClass(actor)||!status.eligible||!hasWeapon||
    preparationClassId===actor.classId;
}
function openClassPreparation():void {
  if(!battle.preparationOpen||battle.phase!=="player"||
      battle.result!=="playing"||endingTurn||board.isAnimating)return;
  setSettings(false);setMobileInfo(false);board.hideCommandMenu();
  const selected=battle.selected;
  preparationUnitId=selected?.team==="ally"?selected.id:preparationUnitId;
  const actor=battle.units.find(u=>u.id===preparationUnitId);
  preparationClassId=actor?.classId??"sword";
  classStatMode="stats";
  classOverlay.hidden=false;
  renderClassPreparation();
  button("class-preparation-close").focus();
}
button("class-preparation-button").addEventListener("click",openClassPreparation);
button("settings-preparation").addEventListener("click",openClassPreparation);
button("class-preparation-close").addEventListener("click",closeClassPreparation);
button("class-preparation-cancel").addEventListener("click",closeClassPreparation);
button("class-tab-stats").addEventListener("click",()=>{
  classStatMode="stats";renderClassPreparation();
});
button("class-tab-growth").addEventListener("click",()=>{
  classStatMode="growth";renderClassPreparation();
});
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
  if (endingTurn || board.isAnimating || battle.campaignStage!=="battle"||
      battle.phase !== "player" || battle.result !== "playing") return;
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
    refresh();renderCampaign();
    if (battle.result === "playing")
      showPhase("第 " + battle.round + " 回合 · 我方行动", "PLAYER PHASE");
  })();
}

function maybeAutoEndTurn(): void {
  if (endingTurn || board.isAnimating || battle.campaignStage!=="battle"||
      !battle.allLivingAlliesSpent) return;
  startEnemyTurn();
}

button("settings-end-turn").addEventListener("click", startEnemyTurn);
button("restart-button").addEventListener("click", () => {
  if (!window.confirm("放弃当前战斗返回整备？未结算的战斗成长不会保留。")) return;
  // Invalidate an in-flight enemy turn and any active interpolation first.
  turnRunId++;
  board.cancelAnimation();
  endingTurn = false;
  battle.restart();
  board.clearInspection();
  board.resetCamera();
  setMobileInfo(false);
  setSettings(false);
  renderCampaign();
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
renderCampaign();
