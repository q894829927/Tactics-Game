/** C2-0: versioned, strictly validated single-player progression snapshot.
 * Only personal ally data survives sorties. Positions, HP in battle, RNG,
 * enemies and actions are NEVER included in persisted data.
 */
import type {Unit,GameResult} from "./battle.ts";
import type {CharacterId} from "./characters.ts";
import {BASIC_KEYS,GROWTH_KEYS,type BasicStats,type GrowthRates} from "./attributes.ts";
import {WEAPON_CATEGORIES,type Weapon} from "./equipmentTypes.ts";
import {WEAPON_LIBRARY,type WeaponId,MAX_INVENTORY,canWield} from "./weapons.ts";
import {CLASS_LIBRARY,type ClassId} from "./classes.ts";
import {PLAYER_CLASS_CHOICES,type PreparationFunds} from "./classCertification.ts";
import type {WeaponExperience} from "./proficiency.ts";
import type {WeaponInstance,SpellCharges} from "./combatResources.ts";
import {emptySortieReward,RESOURCE_CAPS,type SortieReward,type RewardKind}
  from "./sortieRewards.ts";
import {ART_SLOTS,unlockedCombatArts,validArtEquipment,type CombatArtId} from "./combatArts.ts";
import {DEFAULT_LEVEL_ID,isLevelId,validLevelProgress,type LevelId} from "./levels.ts";
import {MASTERY_LIBRARY,MASTERY_SLOTS,unlockedMasteries,
  type MasteryId,type ClassExperience} from "./mastery.ts";

export const CAMPAIGN_STORAGE_KEY="wildfield-tactics.campaign.v1";
export const CAMPAIGN_SCHEMA=1 as const;
export const ALLY_IDS=["a1","a2","a3","a4"] as const;
export type AllyId=typeof ALLY_IDS[number];
export type AllyProgress={
  id:AllyId;classId:ClassId;classLicenses:ClassId[];
  classExperience:ClassExperience;equippedMasteries:MasteryId[];
  equippedArts:CombatArtId[];
  stats:BasicStats;growths:GrowthRates;maxHp:number;level:number;exp:number;
  weaponExp:WeaponExperience;inventory:WeaponId[];
  weaponInstances:Array<WeaponInstance|null>;spellCharges:SpellCharges;
  equippedIndex:number;trainingSlot:number|null;
};
export type UnitProgressDelta={
  id:AllyId;name:string;levelBefore:number;levelAfter:number;
  experienceBefore:number;experienceAfter:number;
  weaponExpGained:number;
  classExpGained:number;
};
export type SortieSettlement={
  result:Exclude<GameResult,"playing">;
  sortie:number;levelId?:LevelId;
  rewardKind?:RewardKind; // absent for old settled campaigns
  repeatVoucherEarned?:boolean;
  units:UnitProgressDelta[];
  /** Fixed victory/defeat payout, already deposited at settlement. */
  reward:SortieReward;
};
export type CampaignSave={
  schema:typeof CAMPAIGN_SCHEMA;
  sortiesCompleted:number;
  selectedLevelId?:LevelId;
  completedLevelIds?:LevelId[];
  /** 0 or 1 unique already-completed stage IDs towards a replay voucher. */
  replayVoucherProgress?:LevelId[];
  ridingPermit?:boolean; // optional only for legacy C2 saves
  funds:PreparationFunds;
  allies:AllyProgress[];
  pendingSettlement:SortieSettlement|null;
};
const copyStats=(stats:BasicStats):BasicStats=>({...stats});
const copyGrowths=(growths:GrowthRates):GrowthRates=>({...growths});
export function captureAlly(unit:Unit):AllyProgress {
  if(!ALLY_IDS.includes(unit.id as AllyId))throw Error("Not a playable ally: "+unit.id);
  return {
    id:unit.id as AllyId,classId:unit.classId,
    classLicenses:[...unit.classLicenses],
    classExperience:{...unit.classExperience},
    equippedMasteries:[...unit.equippedMasteries],equippedArts:[...unit.equippedArts],
    stats:copyStats(unit.stats),growths:copyGrowths(unit.growths),
    maxHp:unit.maxHp,level:unit.level,exp:unit.exp,
    weaponExp:{...unit.weaponExp},inventory:[...unit.inventory],
    weaponInstances:unit.weaponInstances.map(x=>x?{...x}:null),
    spellCharges:{...unit.spellCharges},equippedIndex:unit.equippedIndex,
    trainingSlot:unit.trainingSlot,
  };
}
export function applyAlly(unit:Unit,p:AllyProgress):void {
  if(unit.id!==p.id||unit.team!=="ally")throw Error("Wrong campaign character");
  unit.classId=p.classId;
  unit.role=p.classId;
  unit.classLicenses=[...p.classLicenses];
  unit.classExperience={...p.classExperience};
  unit.equippedMasteries=[...p.equippedMasteries];
  unit.equippedArts=[...p.equippedArts];
  unit.stats=copyStats(p.stats);
  unit.growths=copyGrowths(p.growths);
  unit.maxHp=p.maxHp;
  unit.hp=p.maxHp; // Camp healing between sorties; KO never deletes a character.
  unit.level=p.level;
  unit.exp=p.exp;
  unit.weaponExp={...p.weaponExp};
  unit.inventory=[...p.inventory];
  unit.weaponInstances=p.weaponInstances.map(x=>x?{...x}:null);
  unit.spellCharges={...p.spellCharges};
  unit.equippedIndex=p.equippedIndex;
  unit.trainingSlot=p.trainingSlot;
  unit.weapon={...WEAPON_LIBRARY[unit.inventory[unit.equippedIndex]!]};
  unit.minRange=unit.weapon.minRange;
  unit.maxRange=unit.weapon.maxRange;
  unit.moved=false;unit.acted=false;unit.spent=false;
  unit.statuses=[]; // temporary S1-2 effects never cross sorties
  unit.movedTiles=0;unit.focusReady=false;unit.duelTargetId=null;
}
export function settlementFrom(
  result:Exclude<GameResult,"playing">,sortie:number,before:AllyProgress[],
  units:readonly Unit[],reward:SortieReward=emptySortieReward(),
):SortieSettlement {
  return {result,sortie,reward:{gold:reward.gold,reputation:reward.reputation,
    vouchers:{intermediate:reward.vouchers.intermediate}},units:ALLY_IDS.map(id=>{
    const start=before.find(p=>p.id===id);
    const unit=units.find(u=>u.id===id&&u.team==="ally");
    if(!start||!unit)throw Error("Missing ally for settlement: "+id);
    return {id,name:unit.name,levelBefore:start.level,levelAfter:unit.level,
      experienceBefore:start.exp,experienceAfter:unit.exp,
      weaponExpGained:WEAPON_CATEGORIES.reduce((sum,kind)=>
        sum+Math.max(0,unit.weaponExp[kind]-start.weaponExp[kind]),0),
      classExpGained:(Object.keys(CLASS_LIBRARY) as ClassId[]).reduce((sum,id)=>
        sum+Math.max(0,(unit.classExperience[id]??0)-
          (start.classExperience[id]??0)),0)};
  })};
}
const obj=(v:unknown):v is Record<string,unknown> =>
  typeof v==="object"&&v!==null&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number =>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const keysAreInts=(v:unknown,keys:readonly string[],max:number):boolean =>
  obj(v)&&keys.every(k=>integer(v[k],0,max));
function validClassExperience(value:unknown):value is ClassExperience {
  if(!obj(value))return false;
  return Object.entries(value).every(([id,xp])=>
    Object.hasOwn(CLASS_LIBRARY,id)&&integer(xp,0,
      CLASS_LIBRARY[id as ClassId].masteryThreshold));
}
function validMasteryEquipment(value:unknown,exp:ClassExperience):value is MasteryId[] {
  return Array.isArray(value)&&value.length<=MASTERY_SLOTS&&
    new Set(value).size===value.length&&
    value.every((id:unknown)=>typeof id==="string"&&
      Object.hasOwn(MASTERY_LIBRARY,id)&&
      unlockedMasteries(exp).includes(id as MasteryId));
}
function validAlly(v:unknown):v is AllyProgress {
  if(!obj(v)||!ALLY_IDS.includes(v.id as AllyId)||
    typeof v.classId!=="string"||!Object.hasOwn(CLASS_LIBRARY,v.classId)||
    !(PLAYER_CLASS_CHOICES as readonly string[]).includes(v.classId)||
    !integer(v.maxHp,1,9999)||!integer(v.level,1,99)||!integer(v.exp,0,99)||
    !keysAreInts(v.stats,BASIC_KEYS,9999)||!keysAreInts(v.growths,GROWTH_KEYS,100)||
    !keysAreInts(v.weaponExp,WEAPON_CATEGORIES,1000)||
    !(v.classExperience===undefined||validClassExperience(v.classExperience))||
    !(v.equippedMasteries===undefined||
      validMasteryEquipment(v.equippedMasteries,
        (v.classExperience??{}) as ClassExperience))||
    !(v.equippedArts===undefined||
      validArtEquipment(v.equippedArts,v.weaponExp as WeaponExperience))||
    !Array.isArray(v.classLicenses)||v.classLicenses.length>PLAYER_CLASS_CHOICES.length||
    !v.classLicenses.includes(v.classId)||new Set(v.classLicenses).size!==v.classLicenses.length||
    !v.classLicenses.every((id:unknown)=>typeof id==="string"&&
      (PLAYER_CLASS_CHOICES as readonly string[]).includes(id))||
    !Array.isArray(v.inventory)||v.inventory.length<1||v.inventory.length>MAX_INVENTORY||
    !v.inventory.every((id:unknown)=>typeof id==="string"&&
      Object.hasOwn(WEAPON_LIBRARY,id))||
    !integer(v.equippedIndex,0,v.inventory.length-1)||
    !(v.trainingSlot===null||integer(v.trainingSlot,0,v.inventory.length-1))||
    !Array.isArray(v.weaponInstances)||
    v.weaponInstances.length!==v.inventory.length||!obj(v.spellCharges))
    return false;
  const current=v.inventory[v.equippedIndex] as WeaponId;
  if(!canWield(v.classId as ClassId,current,v.weaponExp as WeaponExperience))return false;
  for(let index=0;index<v.inventory.length;index++){
    const id=v.inventory[index] as WeaponId;
    const w:Weapon=WEAPON_LIBRARY[id];
    const item=v.weaponInstances[index];
    if(w.kind==="magical"){
      if(item!==null)return false;
    }else if(!obj(item)||item.weaponId!==id||
      !integer(item.durability,0,w.maxDurability??0)||
      item.maxDurability!==w.maxDurability||
      typeof item.instanceId!=="string"||item.instanceId.length>128){
      return false;
    }
  }
  if(v.trainingSlot!==null){
    const slot=v.trainingSlot as number;
    if(!v.inventory[slot]||!v.weaponInstances.length)return false;
  }
  for(const [id,amount] of Object.entries(v.spellCharges)){
    if(!Object.hasOwn(WEAPON_LIBRARY,id))return false;
    const w:Weapon=WEAPON_LIBRARY[id as WeaponId];
    if(w.kind!=="magical"||!integer(amount,0,w.maxCharges??0))return false;
  }
  return true;
}
function validReward(v:unknown):v is SortieReward{
  return obj(v)&&integer(v.gold,0,RESOURCE_CAPS.gold)&&
    integer(v.reputation,0,RESOURCE_CAPS.reputation)&&
    obj(v.vouchers)&&integer(v.vouchers.intermediate,0,RESOURCE_CAPS.intermediate);
}
function validSettlement(v:unknown):v is SortieSettlement {
  // C2-0 saves had no reward field. Accept those historical settlements
  // as already paid zero; never grant resources when migrating.
  if(!obj(v)||!(v.result==="victory"||v.result==="defeat")||
    !integer(v.sortie,1,1000000)||!Array.isArray(v.units)||v.units.length!==4||
    !(v.reward===undefined||validReward(v.reward))||
    !(v.levelId===undefined||isLevelId(v.levelId))||
    !(v.rewardKind===undefined||["first-clear","replay","defeat"].includes(v.rewardKind))||
    !(v.repeatVoucherEarned===undefined||typeof v.repeatVoucherEarned==="boolean")||
    (v.rewardKind==="defeat"&&v.result!=="defeat")||
    (v.rewardKind==="first-clear"&&v.result!=="victory")||
    (v.rewardKind==="replay"&&v.result!=="victory")||
    (v.repeatVoucherEarned===true&&v.rewardKind!=="replay"))return false;
  const rows=v.units as unknown[];
  return ALLY_IDS.every(id=>rows.some((row:unknown)=>obj(row)&&row.id===id&&
    typeof row.name==="string"&&row.name.length<=80&&
    integer(row.levelBefore,1,99)&&integer(row.levelAfter,1,99)&&
    integer(row.experienceBefore,0,99)&&integer(row.experienceAfter,0,99)&&
    integer(row.weaponExpGained,0,7000)&&
    (row.classExpGained===undefined||integer(row.classExpGained,0,1300))));
}
/** Read-only validator. Invalid, old, truncated and corrupt saves are rejected. */
export function parseCampaign(raw:unknown):CampaignSave|null{
  if(!obj(raw)||raw.schema!==CAMPAIGN_SCHEMA||
    !integer(raw.sortiesCompleted,0,1000000)||
    !(raw.ridingPermit===undefined||typeof raw.ridingPermit==="boolean")||
    !obj(raw.funds)||
    !integer(raw.funds.reputation,0,100000000)||
    !integer(raw.funds.gold,0,100000000)||
    !obj(raw.funds.vouchers)||
    !integer(raw.funds.vouchers.intermediate,0,100000)||
    !Array.isArray(raw.allies)||raw.allies.length!==4||
    !raw.allies.every(validAlly)||
    !ALLY_IDS.every(id=>(raw.allies as unknown[]).some(x=>obj(x)&&x.id===id))||
    !(raw.pendingSettlement===null||validSettlement(raw.pendingSettlement)))
    return null;
  if(raw.pendingSettlement&&raw.pendingSettlement.sortie!==raw.sortiesCompleted)
    return null;
  const oldVictory=raw.ridingPermit===true||
    (raw.ridingPermit===undefined&&raw.sortiesCompleted>0)||
    (obj(raw.pendingSettlement)&&raw.pendingSettlement.result==="victory");
  const cleared=raw.completedLevelIds===undefined?
    (oldVictory?[DEFAULT_LEVEL_ID]:[]):raw.completedLevelIds;
  const selected=raw.selectedLevelId??DEFAULT_LEVEL_ID;
  if(!validLevelProgress(selected,cleared)||
    (obj(raw.pendingSettlement)&&raw.pendingSettlement.levelId!==undefined&&
     raw.pendingSettlement.levelId!==selected))return null;
  const replay=raw.replayVoucherProgress??[];
  if(!Array.isArray(replay)||replay.length>=2||
    replay.length!==new Set(replay).size||
    !replay.every((id:unknown)=>isLevelId(id)&&(cleared as LevelId[]).includes(id)))
    return null;
  // Migrate C2-0/C2-1 saves without erasing prior progression. Missing C3
  // fields mean no class XP and no equipped passives; invalid fields reject.
  const allies=(raw.allies as AllyProgress[]).map(ally=>({
    ...ally,classExperience:{...(ally.classExperience??{})},
    equippedMasteries:[...(ally.equippedMasteries??[])],
    equippedArts:[...(ally.equippedArts??unlockedCombatArts(ally.weaponExp).slice(0,ART_SLOTS))],
  }));
  const pending=raw.pendingSettlement as SortieSettlement|null;
  const normalized=pending?{
    ...pending,
    reward:pending.reward??emptySortieReward(),
    units:pending.units.map(unit=>({
      ...unit,classExpGained:unit.classExpGained??0,
    })),
  }:null;
  return {...raw,selectedLevelId:selected,completedLevelIds:[...(cleared as LevelId[])],
    replayVoucherProgress:[...(replay as LevelId[])],
    ridingPermit:raw.ridingPermit??raw.sortiesCompleted>=1,
    allies,pendingSettlement:normalized} as CampaignSave;
}
/** Returns a deep, validated copy, never a reference to a browser-owned object. */
export function readCampaignJson(text:string|null):CampaignSave|null {
  if(!text)return null;
  try{
    const checked=parseCampaign(JSON.parse(text));
    return checked?JSON.parse(JSON.stringify(checked)) as CampaignSave:null;
  }catch{return null;}
}
