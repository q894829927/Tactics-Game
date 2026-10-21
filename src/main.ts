import { Battle } from "./engine/battle.ts";
import {LEVELS,type LevelId} from "./engine/levels.ts";
import {LAB_PRESETS,LAB_PRESET_IDS,type LabPresetId} from "./engine/testLab.ts";
import {planSortieReward,DISTINCT_REPLAYS_PER_VOUCHER}
  from "./engine/sortieRewards.ts";
import {COMBAT_ARTS,unlockedCombatArts,ART_SLOTS} from "./engine/combatArts.ts";
import {INNATE_DESCRIPTIONS} from "./engine/innateAbilities.ts";
import {CAMPAIGN_STORAGE_KEY,readCampaignJson,ALLY_IDS,type AllyId} from "./engine/campaign.ts";
import { TERRAIN_INFO, movementCostLabel } from "./engine/terrain.ts";
import { BoardView } from "./scene/BoardView.ts";
import { GAME_VERSION } from "./version.ts";
import {BASIC_KEYS,BASIC_LABELS,GROWTH_KEYS,GROWTH_LABELS} from "./engine/attributes.ts";
import {WEAPON_LIBRARY,weaponRange,canWield} from "./engine/weapons.ts";
import {weaponRankForExp,weaponExperienceText,WEAPON_RANK_THRESHOLDS} from "./engine/proficiency.ts";
import {WEAPON_CATEGORIES} from "./engine/equipmentTypes.ts";
import {weaponResourceText} from "./engine/combatResources.ts";
import {statusDescription} from "./engine/statusEffects.ts";
import {CLASS_LIBRARY,effectiveClassStats,effectiveClassGrowths,type ClassId} from "./engine/classes.ts";
import {classWeaponAvailable,certificationRequirements} from "./engine/classCertification.ts";
import {MASTERY_LIBRARY,MASTERY_SLOTS,classExperienceFor,
  classMastered,unlockedMasteries} from "./engine/mastery.ts";
import "./style.css";

const get = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing UI element: " + id);
  return element;
};
const button = (id: string): HTMLButtonElement => get(id) as HTMLButtonElement;
get("game-version").textContent = GAME_VERSION;
const isLab=new URLSearchParams(window.location.search).get("lab")==="1";
const storedText=isLab?null:(()=>{try{return localStorage.getItem(CAMPAIGN_STORAGE_KEY);}catch{return null;}})();
const loadedCampaign=readCampaignJson(storedText);
const battle=new Battle({campaign:!isLab,lab:isLab,save:loadedCampaign});
let campaignSelectedId:AllyId="a1";
let campaignAttributeMode:"stats"|"growth"="stats";
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
  get("unit-statuses").textContent=selected?(statusDescription(selected)||"无异常状态"):"—";
  const combat = selected ? battle.combatStats(selected) : null;
  get("hp-text").textContent = selected ? selected.hp + " / " + selected.maxHp : "— / —";
  get("hp-fill").style.width = selected ? (selected.hp / selected.maxHp * 100) + "%" : "0%";
  get("stat-attack").textContent = combat ? String(combat.physicalAttack) : "—";
  get("stat-defense").textContent = combat ? String(combat.physicalProtection) : "—";
  get("stat-range").textContent = selected
    ? selected.minRange === selected.maxRange ? String(selected.minRange)
      : selected.minRange + "–" + selected.maxRange : "—";
  get("stat-move").textContent = selected ? String(battle.effectiveMove(selected)) : "—";
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
  button("class-preparation-button").disabled=!canPrepare||isLab;
  button("settings-preparation").disabled=!canPrepare||isLab;
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
    ? "胜利！"+battle.currentLevel.name+" · "+battle.currentLevel.objectiveLabel+"。" : battle.result === "defeat"
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
board.onInventoryRequested=()=>{
  renderSelection();
  if(window.matchMedia("(max-width: 900px), (max-height: 600px) and (pointer: coarse)").matches)
    setMobileInfo(true);
  const bag=get("inventory-list");
  bag.scrollIntoView({block:"nearest",behavior:"instant"});
  (bag.querySelector("button:not(:disabled)") as HTMLButtonElement|null)?.focus();
};
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
  if(isLab)return;
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
    const levelRoot=get("campaign-level-list");levelRoot.replaceChildren();
    get("campaign-level-progress").textContent=battle.completedLevelIds.length+
      " / "+battle.availableLevels.length+" 已完成";
    for(const level of battle.availableLevels){
      const option=document.createElement("button");option.type="button";
      option.className="campaign-level-option"+
        (level.id===battle.selectedLevelId?" selected":"");
      option.disabled=!level.unlocked;
      option.setAttribute("aria-pressed",String(level.id===battle.selectedLevelId));
      const title=document.createElement("strong");
      title.textContent=(level.completed?"✓ ":level.unlocked?"◇ ":"🔒 ")+level.name;
      const desc=document.createElement("span");
      desc.textContent=level.prototype?"临时框架验证关 · 后续重做":
        level.completed?"已通关 · 可重玩":level.unlocked?"可出击":"完成前置关卡后解锁";
      option.append(title,desc);
      option.addEventListener("click",()=>{
        const id=level.id as LevelId;
        if(!battle.selectLevel(id))return;
        board.clearInspection();board.resetCamera();renderCampaign();
      });
      levelRoot.appendChild(option);
    }
    get("campaign-level-description").textContent=battle.currentLevel.description+
      "　胜利目标："+battle.currentLevel.objectiveLabel;
    const quoted=planSortieReward("victory",battle.selectedLevelId,
      battle.completedLevelIds,battle.replayVoucherProgress);
    const label=quoted.kind==="first-clear"?"首次通关":"重复挑战";
    const earned=quoted.reward;
    get("campaign-reward-preview").textContent=label+"预计获得：金币 "+
      earned.gold+"、名声 "+earned.reputation+"、中级考试凭证 "+
      earned.vouchers.intermediate+"。"+(quoted.kind==="replay"?
      quoted.repeatVoucherEarned?"本次完成异关重玩奖励，可额外获得1张凭证。":
      "不同关卡重玩进度 "+(battle.replayVoucherProgress.includes(battle.selectedLevelId)?
        battle.replayVoucherProgress.length:battle.replayVoucherProgress.length+1)+
      "/"+DISTINCT_REPLAYS_PER_VOUCHER+"；重复刷同一关不增加进度。":"");
    const categoryNames={
      sword:"剑",lance:"枪",axe:"斧",bow:"弓",gauntlet:"拳套",
      dark:"黑魔法",white:"白魔法",
    } as const;
    for(const id of ALLY_IDS){
      const ally=battle.units.find(u=>u.id===id)!;
      const job=CLASS_LIBRARY[ally.classId];
      const item=document.createElement("button");
      item.type="button";
      item.className="campaign-unit"+(id===campaignSelectedId?" selected":"");
      item.setAttribute("aria-pressed",String(id===campaignSelectedId));
      const portrait=document.createElement("span");
      portrait.className="campaign-unit-portrait";
      portrait.textContent=job.portrait;
      portrait.setAttribute("aria-hidden","true");
      const info=document.createElement("span");info.className="campaign-unit-info";
      const name=document.createElement("strong");name.textContent=ally.name;
      const subtitle=document.createElement("small");
      subtitle.textContent=job.name+" · Lv."+ally.level;
      const weapon=document.createElement("small");
      weapon.textContent="装备："+WEAPON_LIBRARY[ally.inventory[ally.equippedIndex]!].name;
      info.append(name,subtitle,weapon);
      item.append(portrait,info);
      item.addEventListener("click",()=>{campaignSelectedId=id;renderCampaign();});
      roster.appendChild(item);
    }
    const selected=battle.units.find(u=>u.id===campaignSelectedId)!;
    const job=CLASS_LIBRARY[selected.classId];
    get("campaign-character-portrait").textContent=job.portrait;
    get("campaign-character-title").textContent=selected.name;
    get("campaign-character-subtitle").textContent=
      job.name+" · Lv."+selected.level+" · 体格 "+selected.build;
    const classExp=classExperienceFor(selected.classExperience,selected.classId);
    const mastered=classMastered(selected.classExperience,selected.classId);
    const progress=get("campaign-character-progress");progress.replaceChildren();
    for(const [label,current,max,complete] of [
      ["人物经验",selected.exp,100,selected.level===99],
      ["职业精通",classExp,job.masteryThreshold,mastered],
    ] as const){
      const line=document.createElement("div");line.className="campaign-progress-row";
      const title=document.createElement("span");title.textContent=label;
      const amount=document.createElement("strong");
      amount.textContent=complete?(label==="职业精通"?"已精通":"满级"):
        current+"/"+max;
      const meter=document.createElement("span");meter.className="campaign-progress-meter";
      const fill=document.createElement("span");fill.className="campaign-progress-fill";
      fill.style.width=(complete?100:Math.min(100,current/max*100))+"%";
      meter.appendChild(fill);line.append(title,meter,amount);progress.appendChild(line);
    }

    const statsMode=campaignAttributeMode==="stats";
    button("campaign-tab-stats").classList.toggle("active",statsMode);
    button("campaign-tab-growth").classList.toggle("active",!statsMode);
    button("campaign-tab-stats").setAttribute("aria-pressed",String(statsMode));
    button("campaign-tab-growth").setAttribute("aria-pressed",String(!statsMode));
    const attributes=effectiveClassStats(selected.stats,selected.classId);
    const growths=effectiveClassGrowths(selected.growths,selected.classId);
    const attributeRows:readonly (readonly [string,string])[]=statsMode?[
      ["HP",selected.hp+"/"+selected.maxHp],["移动力",String(selected.move)],
      ["力量",String(attributes.strength)],["防守",String(attributes.defense)],
      ["魔力",String(attributes.magic)],["魔防",String(attributes.resistance)],
      ["速度",String(attributes.speed)],["幸运",String(attributes.luck)],
      ["技巧",String(attributes.dexterity)],["魅力",String(attributes.charm)],
    ]:[
      ["HP",growths.hp+"%"],["移动力","—"],
      ["力量",growths.strength+"%"],["防守",growths.defense+"%"],
      ["魔力",growths.magic+"%"],["魔防",growths.resistance+"%"],
      ["速度",growths.speed+"%"],["幸运",growths.luck+"%"],
      ["技巧",growths.dexterity+"%"],["魅力",growths.charm+"%"],
    ];
    const drawValues=(root:HTMLElement,rows:readonly (readonly [string,string])[],className:string)=>{
      root.replaceChildren();
      for(const [label,value] of rows){
        const line=document.createElement("div");line.className=className;
        const name=document.createElement("span");name.textContent=label;
        const content=document.createElement("strong");content.textContent=value;
        line.append(name,content);root.appendChild(line);
      }
    };
    drawValues(get("campaign-basic-stats"),attributeRows,"campaign-attribute");
    const combat=battle.combatStats(selected);
    drawValues(get("campaign-combat-stats"),[
      ["物攻",String(combat.physicalAttack)],
      ["魔攻",String(combat.magicalAttack)],
      ["耐物",String(combat.physicalProtection)],
      ["耐魔",String(combat.magicalProtection)],
      ["命中",String(combat.hit)],
      ["回避",String(combat.avoid)],
      ["攻速",String(combat.attackSpeed)],
      ["必杀",String(combat.crit)],
      ["必避",String(combat.critAvoid)],
    ],"campaign-combat-stat");

    selected.inventory.forEach((id,index)=>{
      const weapon=WEAPON_LIBRARY[id];
      const allowed=canWield(selected.classId,id,selected.weaponExp);
      const active=selected.equippedIndex===index;
      const entry=document.createElement("button");entry.type="button";
      entry.className="campaign-weapon"+(active?" selected":"");
      entry.disabled=!allowed;entry.setAttribute("aria-pressed",String(active));
      entry.title=allowed?"选择此武器作为出击装备":
        "当前职业或武器熟练度不符合装备要求";
      const headline=document.createElement("span");headline.className="campaign-weapon-title";
      const name=document.createElement("strong");name.textContent=weapon.name;
      const status=document.createElement("small");
      status.textContent=active?"已装备":allowed?"可装备":"无法装备";
      headline.append(name,status);
      const specs=document.createElement("span");specs.className="campaign-weapon-specs";
      specs.textContent="威力 "+weapon.might+" · 命中 "+weapon.hit+
        " · 射程 "+weaponRange(weapon)+" · 需求 "+weapon.requiredRank;
      const resource=document.createElement("span");
      resource.className="campaign-weapon-resource";
      resource.textContent=weaponResourceText(selected,index);
      entry.append(headline,specs,resource);
      entry.addEventListener("click",()=>{battle.prepareEquipWeapon(selected.id,index);});
      equipment.appendChild(entry);
    });

    const prof=get("campaign-proficiency");prof.replaceChildren();
    for(const category of WEAPON_CATEGORIES){
      const xp=selected.weaponExp[category];
      const row=document.createElement("div");
      row.className="campaign-proficiency-item";
      const label=document.createElement("span");label.textContent=categoryNames[category];
      const rank=document.createElement("strong");rank.textContent=weaponRankForExp(xp);
      const value=document.createElement("small");
      value.textContent=weaponExperienceText(selected.weaponExp,category);
      row.append(label,rank,value);prof.appendChild(row);
    }
    const equipped=get("campaign-masteries");equipped.replaceChildren();
    get("campaign-mastery-count").textContent=
      selected.equippedMasteries.length+" / "+MASTERY_SLOTS;
    if(!selected.equippedMasteries.length){
      const empty=document.createElement("span");
      empty.className="campaign-mastery-empty";
      empty.textContent="尚未装备精通特技，可前往「职业整备」解锁和配置。";
      equipped.appendChild(empty);
    }
    for(const id of selected.equippedMasteries){
      const mastery=MASTERY_LIBRARY[id];
      const item=document.createElement("span");item.className="campaign-mastery-tag";
      item.textContent=mastery.name+" · "+mastery.description;
      equipped.appendChild(item);
    }
    get("campaign-save-status").textContent=saveStatus;
  }
  if(settling){
    const outcome=battle.pendingSettlement;
    if(outcome){
      get("campaign-settlement-result").textContent=
        (outcome.result==="victory"?"战斗胜利":"战斗失败")+
        " · "+LEVELS[outcome.levelId??battle.selectedLevelId].name+
        " · 第 "+outcome.sortie+" 次出击";
      get("campaign-reward-kind").textContent=outcome.rewardKind==="first-clear"?
        "首次通关奖励":outcome.rewardKind==="replay"?
        "重复挑战奖励"+(outcome.repeatVoucherEarned?" · 异关重玩凭证 +1":""):
        outcome.rewardKind==="defeat"?"挑战失败 · 无额外奖励":
        "历史版本结算 · 既有奖励已入账";
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
          " · 武器经验 +"+unit.weaponExpGained+
          " · 职业经验 +"+unit.classExpGained;
        row.append(label,stats);rows.appendChild(row);
      }
    }
  }
}
button("campaign-tab-stats").addEventListener("click",()=>{
  campaignAttributeMode="stats";renderCampaign();
});
button("campaign-tab-growth").addEventListener("click",()=>{
  campaignAttributeMode="growth";renderCampaign();
});
button("campaign-change-class").addEventListener("click",()=>{
  preparationUnitId=campaignSelectedId;openClassPreparation();
});
button("campaign-start-sortie").addEventListener("click",()=>{
  if(battle.beginSortie()){
    showPhase("第 1 回合 · 我方行动","PLAYER PHASE");
    get("viewport-hint").textContent="本关目标："+battle.currentLevel.objectiveLabel;
  }
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
  acolyte:"使用白魔法治疗与辅助友军，以支援方式影响战局。",
  duelist:"熟练运用剑术的进阶职业，拥有更高的速度补正。",
  sentinel:"原地建立防线，减少近战物理攻击伤害，易受魔法突破。",
  formationBreaker:"破阵战士：针对高防守和重甲目标，擅长斧系破阵。",
  eliteMarksman:"精锐射手：保持阵地完成精准远射，失去机动灵活性。",
  martialArtist:"斗技家：以闪避反应积累下一次主动出拳优势。",
  arcanist:"秘术师：善用异常状态与黑魔法强化伤害。",
  healer:"祈疗师：专精有效治疗，不依赖伤害刷资源。",
  roverCavalry:"游骑兵：需要骑乘许可，行军迅速但不利森林丘陵。",
  scout:"斥候：剑弓双系兼修，善用森林隐蔽与低成本穿越。",
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
    const experience=classExperienceFor(actor.classExperience,id);
    caption.textContent=label+" · "+(classMastered(actor.classExperience,id)
      ?"已精通":("职业经验 "+experience+"/"+cls.masteryThreshold));
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
    ["HP",actor.maxHp,actor.maxHp],
    ["移动力",battle.effectiveMove(actor),
      battle.effectiveMove({...actor,classId:preparationClassId})],
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
    const passed=preparationClassId==="roverCavalry"
      ?actor.weaponExp.sword>=WEAPON_RANK_THRESHOLDS.D||
        actor.weaponExp.lance>=WEAPON_RANK_THRESHOLDS.D
      :xp>=WEAPON_RANK_THRESHOLDS[required as keyof typeof WEAPON_RANK_THRESHOLDS];
    const chip=document.createElement("div");
    chip.className="class-requirement-chip "+(passed?"met":"unmet");
    const emblem=document.createElement("span");
    emblem.className="class-requirement-icon";
    emblem.textContent=CLASS_SYMBOLS[kind]??"◆";
    emblem.setAttribute("aria-hidden","true");
    const title=document.createElement("span");
    title.className="class-requirement-text";
    title.textContent=(preparationClassId==="roverCavalry"?"任选 · ":"")+
      (({sword:"剑术",lance:"枪术",axe:"斧术",bow:"弓术",gauntlet:"拳术",
         dark:"黑魔法",white:"白魔法"} as Record<string,string>)[category]??category);
    const rank=document.createElement("strong");
    rank.textContent=required;
    const progress=document.createElement("small");
    progress.textContent="当前 "+current+(passed?" ✓":" · 未达到");
    chip.append(emblem,title,rank,progress);
    chip.title=title.textContent+"需求 "+required+"，当前 "+current;
    requirementsRoot.appendChild(chip);
  }
  get("class-preview-trait").textContent=
    (WEAPON_TRAIT_LABELS[cls.weaponCategories[0]]??"暂无可用的武器系规则")+
    "；固有：" +cls.innateAbilityIds.map(id=>
      INNATE_DESCRIPTIONS[id as keyof typeof INNATE_DESCRIPTIONS]??id).join(" / ");
  const progress=classExperienceFor(actor.classExperience,preparationClassId);
  const reward=cls.masteryRewardIds[0];
  const ability=reward&&Object.hasOwn(MASTERY_LIBRARY,reward)
    ? MASTERY_LIBRARY[reward as keyof typeof MASTERY_LIBRARY]:null;
  get("class-preview-mastery").textContent=ability
    ? (classMastered(actor.classExperience,preparationClassId)?"已精通":"职业经验 "+
      progress+"/"+cls.masteryThreshold)+" · "+ability.name+"（"+ability.description+"）"
    : "当前职业无开放的精通奖励";
  const unlocked=unlockedMasteries(actor.classExperience);
  get("class-mastery-slots").textContent=
    actor.equippedMasteries.length+" / "+MASTERY_SLOTS;
  const loadout=get("class-mastery-equipment");loadout.replaceChildren();
  if(!unlocked.length){
    const empty=document.createElement("p");
    empty.className="class-mastery-empty";
    empty.textContent="尚未精通任何职业。战斗积累职业经验后解锁可继承特技。";
    loadout.appendChild(empty);
  }
  for(const id of unlocked){
    const item=MASTERY_LIBRARY[id];
    const active=actor.equippedMasteries.includes(id);
    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.className="class-mastery-toggle"+(active?" active":"");
    toggle.setAttribute("aria-pressed",String(active));
    toggle.disabled=!active&&actor.equippedMasteries.length>=MASTERY_SLOTS;
    toggle.textContent=(active?"✓ 已装备 · ":"可装备 · ")+item.name+" · "+item.description;
    toggle.addEventListener("click",()=>{
      if(battle.toggleMastery(actor.id,id))renderClassPreparation();
    });
    loadout.appendChild(toggle);
  }

  const artRoot=get("class-art-equipment");artRoot.replaceChildren();
  get("class-art-slots").textContent=actor.equippedArts.length+" / "+ART_SLOTS;
  const knownArts=unlockedCombatArts(actor.weaponExp);
  if(!knownArts.length){
    const empty=document.createElement("p");empty.className="class-mastery-empty";
    empty.textContent="武器熟练度达到D（黑魔法C）后自动学会战技。";
    artRoot.appendChild(empty);
  }
  for(const id of knownArts){
    const art=COMBAT_ARTS[id],active=actor.equippedArts.includes(id);
    const toggle=document.createElement("button");
    toggle.type="button";toggle.className="class-mastery-toggle"+(active?" active":"");
    toggle.setAttribute("aria-pressed",String(active));
    toggle.disabled=!active&&actor.equippedArts.length>=ART_SLOTS;
    toggle.textContent=(active?"✓ 已装备 · ":"可装备 · ")+art.name+
      " ["+art.category+" "+art.rank+"] · "+art.description;
    toggle.addEventListener("click",()=>{if(battle.toggleCombatArt(actor.id,id))renderClassPreparation();});
    artRoot.appendChild(toggle);
  }

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
  if(isLab||!battle.preparationOpen||battle.phase!=="player"||
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
  if(!isLab&&!window.confirm("放弃当前战斗返回整备？未结算的战斗成长不会保留。")) return;
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

const labToolbar=get("lab-toolbar");
labToolbar.hidden=!isLab;
if(isLab){
  const picker=get("lab-preset") as HTMLSelectElement;
  picker.replaceChildren();
  for(const id of LAB_PRESET_IDS){
    const option=document.createElement("option");
    option.value=id;option.textContent=LAB_PRESETS[id].name;picker.appendChild(option);
  }
  const detail=()=>{const fixture=LAB_PRESETS[battle.labPreset];
    get("lab-description").textContent=fixture.description;
    get("lab-status").textContent="测试点："+fixture.coverage+
      " · 第 "+battle.round+" 回合 · "+(battle.result==="playing"?"进行中":
      battle.result==="victory"?"已完成":"失败")+" · 不保存战役数据";
  };
  const reset=(preset?:LabPresetId)=>{
    turnRunId++;board.cancelAnimation();endingTurn=false;
    if(preset)battle.selectLabPreset(preset);else battle.restart();
    board.hideCommandMenu();board.clearInspection();board.resetCamera();
    setMobileInfo(false);setSettings(false);
    picker.value=battle.labPreset;
    refresh();detail();
  };
  picker.value=battle.labPreset;
  picker.addEventListener("change",()=>reset(picker.value as LabPresetId));
  button("lab-reset").addEventListener("click",()=>reset());
  battle.onChange=()=>{refresh();detail();queueMicrotask(maybeAutoEndTurn);};
  detail();
}
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
