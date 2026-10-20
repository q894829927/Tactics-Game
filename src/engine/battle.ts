import { TERRAIN_INFO, type Terrain } from "./terrain.ts";
import { determineFollowUp } from "./followUp.ts";
import {effectiveMight,defensiveAvoidBonus,strikeDamage,traitLabel} from "./weaponTraits.ts";
import {initialLoadout,weaponFor,canWield,MAX_INVENTORY,type WeaponId} from "./weapons.ts";
import {deriveCombat,awardExperience,clampChance,
  type CharacterData,type CombatStats} from "./attributes.ts";
import {CHARACTER_LIBRARY,createCharacter,type CharacterId} from "./characters.ts";
import {CLASS_LIBRARY,effectiveClassStats,effectiveClassGrowths,type ClassId} from "./classes.ts";
import {PLAYER_CLASS_CHOICES,INITIAL_PREPARATION_FUNDS,certificationRequirements,
  classCertificationStatus,classWeaponAvailable,loanerForClass,
  type PreparationFunds,type CertificationStatus} from "./classCertification.ts";
import type {Weapon} from "./equipmentTypes.ts";
import {ALLY_IDS,captureAlly,applyAlly,parseCampaign,settlementFrom,
  type AllyProgress,type CampaignSave,type SortieSettlement} from "./campaign.ts";
import {refillSpells} from "./combatResources.ts";
import {calculateSortieReward,creditSortieReward} from "./sortieRewards.ts";
import {awardWeaponExperience,meetsWeaponRank} from "./proficiency.ts";
import {innateHitBonus,inheritedHitBonus,innateDamageBonus,innateHealBonus,
  innateAvoid,innatePhysicalProtection,innateReduction,terrainStepCost}
  from "./innateAbilities.ts";
import {CAREER_ARTS,careerArtForClass,isCareerArtId,
  type CareerArt,type CareerArtId} from "./careerArts.ts";
import {COMBAT_ARTS,unlockedCombatArts,ART_SLOTS,isCombatArtId,
 type CombatArtId,type CombatArt} from "./combatArts.ts";
import {MASTERY_LIBRARY,MASTERY_SLOTS,unlockedMasteries,gainClassExperience,
  applyEquippedMasteries,type MasteryId,type ClassExperience}
  from "./mastery.ts";
import {activeWeaponId} from "./combatResources.ts";
import {makeAttackAction,makeSupportAction,canPayActionCosts,payActionCosts,
  type ActionSpec,type ActionCost} from "./actionSpec.ts";
import {applyStatus,removeStatus,statusPower,startStatusPhase,finishStatusPhase,
  absorbDamage,previewDamage,type StatusKind,type StatusInstance}
  from "./statusEffects.ts";
import {initialWeaponInstances,initialSpellCharges,makeWeaponInstance,
  resourceWeapon,remainingSpellCharges,canUseAttack,
  canUseArt,isSpell,type WeaponInstance,type SpellCharges}
  from "./combatResources.ts";
export type { Terrain } from "./terrain.ts";
import {LEVELS,LEVEL_IDS,DEFAULT_LEVEL_ID,levelUnlocked,objectiveComplete,type LevelId} from "./levels.ts";

export const MAP_WIDTH = 10;
export const MAP_HEIGHT = 8;
export type Team = "ally" | "enemy";
export type GameResult = "playing" | "victory" | "defeat";
/** Deprecated UI compatibility alias; classId is authoritative in gameplay. */
export type Role = ClassId;
export type Point = { x: number; y: number };
/** Read-only movement plus potential attack preview for one enemy. */
/** Single enemy action plan, created before animation and committed afterwards. */
export type EnemyActionPlan = {
  unitId: string;
  destination: Point;
  path: Point[];
  targetId: string | null;
};

export type EnemyThreat = {
  move: Set<string>;
  attack: Set<string>;
};

export type CombatEvent = {
  kind: "attack" | "counter" | "follow-up";
  fromId: string; toId: string;
  missed: boolean; critical: boolean; damage: number;
  fromHpAfter: number; toHpAfter: number;
  defeated: boolean;absorbed?:number;
};

export type ActionCommitEvent={
  kind:"confirmed"|"resource"|"strike";
  actorId:string;targetId:string;actionId:string;
  cost?:ActionCost;combat?:CombatEvent;
};

export type ActionPreview={spec:ActionSpec;forecast:AttackForecast};

export type SupportEffect="heal"|"shield"|"burn"|"slow"|"weakArmor"|"weakMagic"|"mark"|"wardArmor";
export type SupportPreview={effect:SupportEffect;value:number;cost:number;remaining:number;resistChance:number};
export type AttackForecast = {
  damage:number; counterDamage:number; canCounter:boolean;
  attackerHpAfter:number; defenderHpAfter:number;
  attackerHit:number; defenderHit:number; attackerCrit:number; defenderCrit:number;
  followUp:"attacker"|"defender"|null;
  /** Damage of only the additional attack, computed independently for sword. */
  followUpDamage:number;
  attackerTrait:string;defenderTrait:string;
  /** On normal-hit kill only, this optional one-step retreat is already legal. */
  retreatTo?:Point|null;
  /** Visible on-hit effect of a job-specific art (not a guaranteed hit). */
  careerEffect?:string;
};

export type Unit = CharacterData & {
  id:string;characterId:CharacterId;name:string;
  classId:ClassId;role:Role;team:Team;x:number;y:number;
  /** Weapon inventory, initially 3 character-specific items, at most 5. */
  inventory:WeaponId[]; equippedIndex:number;
  /** Currently equipped combat weapon, separate from permanent personal data. */
  weapon:Weapon;
  weaponInstances:Array<WeaponInstance|null>;
  spellCharges:SpellCharges;
  /** Certified jobs never alter permanent weapon XP or personal growths. */
  classLicenses:ClassId[];
  /** XP is tracked separately for each class, capped at its mastery threshold. */
  classExperience:ClassExperience;
  /** At most two unlocked cross-class passives selected during preparation. */
  equippedMasteries:MasteryId[];
  equippedArts:CombatArtId[];
  /** One replaceable loaned basic weapon for classes outside owned inventory. */
  trainingSlot:number|null;
  /** Legacy mirrors for older client/tests; battle calculations read weapon directly. */
  minRange:number;maxRange:number;
  statuses:StatusInstance[];
  movedTiles:number;focusReady:boolean;duelTargetId:string|null;
  moved:boolean;acted:boolean;spent:boolean;
  holdPosition:boolean; // enemy-only level AI, not persisted
};

function unit(id:CharacterId,team:Team,x:number,y:number):Unit {
  const definition=CHARACTER_LIBRARY[id];
  const classId=definition.startingClassId;
  const inventory=initialLoadout(id);
  const character=createCharacter(id);
  if(inventory.length===0||inventory.length>MAX_INVENTORY||
      !inventory.every(weaponId=>canWield(classId,weaponId,character.weaponExp))){
    throw Error("Invalid starting equipment for character "+id);
  }
  const equipped=weaponFor(inventory[0]!);
  return {id,characterId:id,name:definition.name,classId,role:classId,team,x,y,
    ...character,
    weapon:equipped,inventory,equippedIndex:0,
    weaponInstances:initialWeaponInstances(id,inventory),
    spellCharges:initialSpellCharges(inventory),
    classLicenses:[classId],classExperience:{},equippedMasteries:[],
    equippedArts:team==="ally"?unlockedCombatArts(character.weaponExp).slice(0,ART_SLOTS):[],
    trainingSlot:null,
    minRange:equipped.minRange,maxRange:equipped.maxRange,
    statuses:[],movedTiles:0,focusReady:false,duelTargetId:null,
    moved:false,acted:false,spent:false,holdPosition:false};
}
export function key(p: Point): string { return String(p.x) + "," + String(p.y); }
export function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function inBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

export class Battle {
  terrain:readonly string[]=LEVELS[DEFAULT_LEVEL_ID].terrain;
  selectedLevelId:LevelId=DEFAULT_LEVEL_ID;
  completedLevelIds:LevelId[]=[];
  get currentLevel(){return LEVELS[this.selectedLevelId];}
  get availableLevels(){return LEVEL_IDS.map(id=>({
    ...LEVELS[id],unlocked:levelUnlocked(id,this.completedLevelIds),
    completed:this.completedLevelIds.includes(id),
  }));}
  private setupLevel(id:LevelId):void{
    this.selectedLevelId=id;
    this.terrain=LEVELS[id].terrain;
    this.units=LEVELS[id].spawns.map(p=>{
      const spawned=unit(p.id,p.team,p.x,p.y);
      if("classId" in p&&p.classId!==undefined){
        if(!canWield(p.classId,spawned.inventory[spawned.equippedIndex]!,spawned.weaponExp))
          throw Error("Invalid encounter class in "+id);
        spawned.classId=p.classId;spawned.role=p.classId;
      }
      spawned.holdPosition="holdPosition" in p&&p.holdPosition===true;
      return spawned;
    });
  }
  selectLevel(id:LevelId):boolean{
    if(!this.campaignEnabled||this.campaignStage!=="preparation"||
      this.result!=="playing"||!Object.hasOwn(LEVELS,id)||
      !levelUnlocked(id,this.completedLevelIds))return false;
    if(id===this.selectedLevelId)return true;
    const progress=this.campaignSnapshot();
    this.setupLevel(id);
    for(const p of progress.allies){
      const ally=this.units.find(u=>u.id===p.id&&u.team==="ally");
      if(!ally)throw Error("Missing ally in stage "+id);
      applyAlly(ally,p);
    }
    this.moveOrigin=null;this.selectedId=null;this.enemyQueue=[];
    this.lastCombatEvents=[];this.lastActionEvents=[];
    this.emit();return true;
  }
  units: Unit[] = [];
  selectedId: string | null = null;
  round = 1;
  phase: "player" | "enemy" = "player";
  result: GameResult = "playing";
  log: string[] = [];
  /** Immutable copies of the most recent completed combat's ordered strikes. */
  lastCombatEvents: CombatEvent[] = [];
  /** S1-0 ordered action receipt, separate from legacy visual combat events. */
  lastActionEvents:ActionCommitEvent[]=[];
  /** Keeps the just-spent physical weapon's effectiveness for this encounter. */
  private committingWeapon:Map<string,Weapon>|null=null;
  onChange: (() => void) | null = null;
  preparationOpen=true;
  readonly campaignEnabled:boolean;
  campaignStage:"preparation"|"battle"|"settlement"="battle";
  sortiesCompleted=0;
  ridingPermit=false;
  pendingSettlement:SortieSettlement|null=null;
  private sortieStart:CampaignSave|null=null;
  /** C1 supports credential checks. The E1 reward/economy loop is future work. */
  preparationFunds:PreparationFunds={
    reputation:0,gold:0,vouchers:{intermediate:0},
  };
  private moveOrigin: Point | null = null;
  private enemyQueue: string[] = [];
  private randomState=0x2946e73b;
  private phaseSerial:{ally:number;enemy:number}={ally:1,enemy:0};
  setRandomSeed(seed:number):void {this.randomState=(seed>>>0)||1;}
  private nextRandom():number {
    let x=this.randomState;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    this.randomState=x>>>0;
    return this.randomState/4294967296;
  }
  private roll(chance:number):boolean {
    return chance>=100?true:chance<=0?false:this.nextRandom()*100<chance;
  }

  constructor(options?:{campaign?:boolean;save?:CampaignSave|null}){
    this.campaignEnabled=!!options?.campaign;
    this.restart();
    if(this.campaignEnabled&&options?.save)this.loadCampaign(options.save);
  }

  restart(): void {
    // In campaign mode restarting a sortie abandons the current in-battle
    // gains; already completed sorties remain safely committed.
    const saved=this.campaignEnabled
      ? this.sortieStart??(this.campaignStage==="preparation"?this.campaignSnapshot():null)
      : null;
    this.setupLevel(saved?.selectedLevelId??this.selectedLevelId);    this.round = 1;
    this.ridingPermit=false;
    this.phaseSerial={ally:1,enemy:0};
    this.preparationOpen=true;
    this.preparationFunds={
      reputation:INITIAL_PREPARATION_FUNDS.reputation,
      gold:INITIAL_PREPARATION_FUNDS.gold,
      vouchers:{...INITIAL_PREPARATION_FUNDS.vouchers},
    };
    this.phase = "player";
    this.enemyQueue = [];
    this.result = "playing";
    this.setRandomSeed(0x2946e73b);
    this.selectedId = null;
    this.moveOrigin = null;
    this.log = [];
    this.lastCombatEvents = [];
    this.lastActionEvents = [];
    this.committingWeapon=null;
    this.campaignStage=this.campaignEnabled?"preparation":"battle";
    if(this.campaignEnabled){
      this.sortieStart=null;
      this.pendingSettlement=null;
      if(saved)this.restoreCampaign(saved,false);
    }
    this.emit();
  }

  /** C2-0: immutable progression-only snapshot, never a live battle save. */
  campaignSnapshot():CampaignSave {
    if(!this.campaignEnabled)throw Error("Campaign is not enabled");
    const units=this.campaignStage==="battle"&&this.sortieStart
      ? this.sortieStart.allies
      : this.aliveAndDefeatedAllies().map(captureAlly);
    return {schema:1,sortiesCompleted:this.sortiesCompleted,
      selectedLevelId:this.selectedLevelId,completedLevelIds:[...this.completedLevelIds],
      ridingPermit:this.ridingPermit,
      funds:{gold:this.preparationFunds.gold,reputation:this.preparationFunds.reputation,
        vouchers:{...this.preparationFunds.vouchers}},
      allies:units.map(x=>({...x,stats:{...x.stats},growths:{...x.growths},
        weaponExp:{...x.weaponExp},inventory:[...x.inventory],
        classLicenses:[...x.classLicenses],classExperience:{...x.classExperience},
        equippedMasteries:[...x.equippedMasteries],equippedArts:[...x.equippedArts],
        spellCharges:{...x.spellCharges},
        weaponInstances:x.weaponInstances.map(w=>w?{...w}:null)})),
      pendingSettlement:this.pendingSettlement
        ? {result:this.pendingSettlement.result,sortie:this.pendingSettlement.sortie,
          levelId:this.pendingSettlement.levelId,
          reward:{gold:this.pendingSettlement.reward.gold,
            reputation:this.pendingSettlement.reward.reputation,
            vouchers:{...this.pendingSettlement.reward.vouchers}},
          units:this.pendingSettlement.units.map(u=>({...u}))}:null};
  }
  private aliveAndDefeatedAllies():Unit[]{
    return ALLY_IDS.map(id=>{
      const ally=this.units.find(u=>u.id===id&&u.team==="ally");
      if(!ally)throw Error("Missing ally: "+id);
      return ally;
    });
  }
  private restoreCampaign(save:CampaignSave,resumeSettlement:boolean):void {
    const checked=parseCampaign(save);
    if(!checked)throw Error("Invalid campaign progress");
    this.setupLevel(checked.selectedLevelId??DEFAULT_LEVEL_ID);
    for(const p of checked.allies){
      const ally=this.units.find(u=>u.id===p.id&&u.team==="ally");
      if(!ally)throw Error("Unknown ally: "+p.id);
      applyAlly(ally,p);
    }
    this.preparationFunds={gold:checked.funds.gold,
      reputation:checked.funds.reputation,vouchers:{...checked.funds.vouchers}};
    this.sortiesCompleted=checked.sortiesCompleted;
    this.completedLevelIds=[...(checked.completedLevelIds??[])];
    this.ridingPermit=checked.ridingPermit??false;
    this.pendingSettlement=resumeSettlement?checked.pendingSettlement:null;
    this.campaignStage=resumeSettlement&&checked.pendingSettlement?"settlement":"preparation";
    this.preparationOpen=this.campaignStage==="preparation";
    this.result=this.pendingSettlement?.result??"playing";
    this.selectedId=null;
  }
  /** Load only validated, versioned character progression from local storage. */
  loadCampaign(save:CampaignSave):void {
    if(!this.campaignEnabled)throw Error("Campaign is not enabled");
    this.restoreCampaign(save,true);
    this.sortieStart=null;
    this.emit();
  }
  /** Preparation confirms the loadout; restores only per-sortie spell casts.
   * Physical durability, levels, professions and weapon XP are untouched.
   */
  beginSortie():boolean {
    if(!this.campaignEnabled||this.campaignStage!=="preparation"||
      !levelUnlocked(this.selectedLevelId,this.completedLevelIds)||
      this.result!=="playing"||this.phase!=="player")return false;
    if(!this.aliveAndDefeatedAllies().every(u=>
      canWield(u.classId,u.inventory[u.equippedIndex]!,u.weaponExp)))return false;
    this.sortieStart=this.campaignSnapshot();
    this.pendingSettlement=null;
    for(const unit of this.aliveAndDefeatedAllies()){
      unit.hp=unit.maxHp;
      refillSpells(unit.spellCharges,unit.inventory);
      unit.moved=false;unit.acted=false;unit.spent=false;
      unit.movedTiles=0;unit.focusReady=false;unit.duelTargetId=null;
    }
    this.preparationOpen=false;
    this.campaignStage="battle";
    this.emit();
    return true;
  }
  /** Battle result is acknowledged exactly once; new sortie starts from
   * fresh enemies and positions with the preserved personal progression.
   */
  returnToPreparation():boolean {
    if(!this.campaignEnabled||this.campaignStage!=="settlement"||
      !this.pendingSettlement)return false;
    const finished=this.campaignSnapshot();
    this.sortieStart=null;
    this.setupLevel(this.selectedLevelId);    this.round=1;this.phase="player";this.result="playing";
    this.phaseSerial={ally:1,enemy:0};
    this.enemyQueue=[];this.moveOrigin=null;this.selectedId=null;
    this.log=[];this.lastCombatEvents=[];
    this.setRandomSeed(0x2946e73b);
    this.restoreCampaign({...finished,pendingSettlement:null},false);
    this.emit();
    return true;
  }
  /** The only destructive reset: explicit user confirmation in the UI.
   * An ordinary restart must preserve already earned campaign progression.
   */
  resetCampaign():void {
    if(!this.campaignEnabled)throw Error("Campaign is not enabled");
    this.sortieStart=null;
    this.sortiesCompleted=0;
    this.completedLevelIds=[];
    this.selectedLevelId=DEFAULT_LEVEL_ID;
    this.ridingPermit=false;
    this.pendingSettlement=null;
    this.campaignStage="battle";
    this.restart();
  }

  /** Change equipment during dedicated preparation, outside action economy. */
  prepareEquipWeapon(unitId:string,index:number):boolean{
    if(!this.campaignEnabled||this.campaignStage!=="preparation")return false;
    const unit=this.units.find(u=>u.id===unitId&&u.team==="ally");
    if(!unit||!Number.isInteger(index)||index<0||index>=unit.inventory.length||
      !canWield(unit.classId,unit.inventory[index]!,unit.weaponExp))return false;
    unit.equippedIndex=index;unit.weapon=weaponFor(unit.inventory[index]!);
    unit.minRange=unit.weapon.minRange;unit.maxRange=unit.weapon.maxRange;
    this.emit();return true;
  }

  get classChoices():readonly ClassId[]{return PLAYER_CLASS_CHOICES;}

  /** Reclassing is only available in the initial preparation window. */
  classStatus(unit:Unit,target:ClassId):CertificationStatus {
    return classCertificationStatus(target,unit.weaponExp,
      unit.classLicenses,this.preparationFunds,this.ridingPermit);
  }
  canPrepareClass(unit:Unit):boolean {
    return this.preparationOpen&&
      (!this.campaignEnabled||this.campaignStage==="preparation")&&
      this.round===1&&this.phase==="player"&&
      this.result==="playing"&&this.units.includes(unit)&&
      unit.team==="ally"&&unit.hp>0&&!unit.moved&&!unit.acted&&!unit.spent;
  }
  /** Mastery inherits across jobs but must be equipped during preparation. */
  toggleMastery(unitId:string,id:MasteryId):boolean{
    const actor=this.units.find(u=>u.id===unitId&&u.team==="ally");
    if(!actor||!this.canPrepareClass(actor)||!Object.hasOwn(MASTERY_LIBRARY,id))
      return false;
    const position=actor.equippedMasteries.indexOf(id);
    if(position>=0)actor.equippedMasteries.splice(position,1);
    else {
      if(actor.equippedMasteries.length>=MASTERY_SLOTS||
          !unlockedMasteries(actor.classExperience).includes(id))return false;
      actor.equippedMasteries.push(id);
    }
    this.emit();
    return true;
  }
  /** Equipping an unlocked art is restricted to preparation; no skill swapping mid-combat. */
  toggleCombatArt(unitId:string,id:CombatArtId):boolean{
    const actor=this.units.find(u=>u.id===unitId&&u.team==="ally");
    if(!actor||!this.canPrepareClass(actor)||!isCombatArtId(id)||
      !unlockedCombatArts(actor.weaponExp).includes(id))return false;
    const position=actor.equippedArts.indexOf(id);
    if(position>=0)actor.equippedArts.splice(position,1);
    else{if(actor.equippedArts.length>=ART_SLOTS)return false;actor.equippedArts.push(id);}
    this.emit();return true;
  }
  /** No fixed promotion tree. First basic certification is free; earned
   * intermediate credentials are consumed once and licenses persist.
   */
  changeClass(unitId:string,target:ClassId):boolean {
    const actor=this.units.find(unit=>unit.id===unitId);
    if(!actor||!this.canPrepareClass(actor)||
      !Object.prototype.hasOwnProperty.call(CLASS_LIBRARY,target))return false;
    if(actor.classId===target)return false;
    const qualification=this.classStatus(actor,target);
    if(!qualification.eligible||
      !classWeaponAvailable(target,actor.inventory,actor.weaponExp))return false;
    const ownedIndex=actor.inventory.findIndex(id=>
      canWield(target,id,actor.weaponExp));
    const needsLoaner=ownedIndex<0;
    const loaner=needsLoaner?loanerForClass(target,actor.weaponExp):null;
    const loanerIndex=actor.trainingSlot??actor.inventory.length;
    if(needsLoaner&&(!loaner||loanerIndex>=MAX_INVENTORY))return false;
    const costs=certificationRequirements(target);
    // Every validation above is read-only. Only now mutate atomically.
    if(!qualification.alreadyCertified){
      this.preparationFunds.gold-=costs.gold;
      if(costs.voucher)this.preparationFunds.vouchers[costs.voucher]--;
      actor.classLicenses.push(target);
    }
    let index=ownedIndex;
    if(needsLoaner&&loaner){
      index=loanerIndex;
      actor.trainingSlot=loanerIndex;
      actor.inventory[index]=loaner;
      actor.weaponInstances[index]=makeWeaponInstance(actor.characterId,index,loaner);
      if(isSpell(weaponFor(loaner)))
        actor.spellCharges[loaner]??=weaponFor(loaner).maxCharges??0;
    }
    actor.classId=target;
    actor.role=target; // read-only compatibility mirror for old consumers
    actor.equippedIndex=index;
    actor.weapon=weaponFor(actor.inventory[index]!);
    actor.minRange=actor.weapon.minRange;
    actor.maxRange=actor.weapon.maxRange;
    // Do not mutate personal stats/growths, HP, level or permanent XP.
    this.selectedId=null;
    this.moveOrigin=null;
    this.emit();
    return true;
  }

  /** Equipping is reversible and does not spend movement, attack or log an action. */
  equipWeapon(unit:Unit,index:number):boolean {
    if(this.result!=="playing"||this.phase!=="player"||
      unit.team!=="ally"||unit.hp<=0||unit.spent||this.selectedId!==unit.id||
      !this.units.includes(unit)||!Number.isInteger(index)||index<0||
      index>=unit.inventory.length||unit.inventory.length>MAX_INVENTORY)return false;
    const id=unit.inventory[index]!;
    if(!canWield(unit.classId,id,unit.weaponExp))return false;
    if(unit.weaponInstances[index]===undefined)
      unit.weaponInstances[index]=makeWeaponInstance(unit.characterId,index,id);
    if(isSpell(weaponFor(id))&&unit.spellCharges[id]===undefined)
      unit.spellCharges[id]=weaponFor(id).maxCharges??0;
    unit.equippedIndex=index;
    unit.weapon=weaponFor(id);
    // Compatibility only: targeting, predictions and AI all use unit.weapon.
    unit.minRange=unit.weapon.minRange;
    unit.maxRange=unit.weapon.maxRange;
    this.emit();
    return true;
  }

  /** S1-0 sample-art chooser; no full skill or mastery unlocks in this stage. */
  availableArtWeapons(unit:Unit):number[]{
    if(this.phase!=="player"||this.result!=="playing"||
      unit.team!=="ally"||unit.hp<=0||unit.spent||unit.acted)return [];
    return unit.inventory.flatMap((id,index)=>{
      if(!canWield(unit.classId,id,unit.weaponExp))return [];
      const candidate={...unit,weapon:weaponFor(id),equippedIndex:index};
      if(isSpell(candidate.weapon)||!canUseArt(candidate,this.basicArt.durabilityCost))
        return [];
      return this.targets(candidate).length?[index]:[];
    });
  }

  /** Has this ally any owned weapon that can hit an enemy from its present tile? */
  availableAttackWeapons(unit:Unit):number[] {
    if(this.result!=="playing"||this.phase!=="player"||unit.team!=="ally"||
      unit.hp<=0||unit.spent||unit.acted)return [];
    return unit.inventory.flatMap((id,index)=>{
      if(!canWield(unit.classId,id,unit.weaponExp))return [];
      const candidate={...unit,weapon:weaponFor(id),equippedIndex:index};
      return this.targets(candidate).length ? [index] : [];
    });
  }

  get selected(): Unit | undefined {
    return this.units.find(u => u.id === this.selectedId && u.hp > 0);
  }
  get canCancelMove(): boolean {
    const selected = this.selected;
    return !!(selected && selected.team === "ally" && selected.moved &&
      !selected.acted && !selected.spent && this.moveOrigin);
  }

  cancelMove(): boolean {
    if (this.phase !== "player" || !this.canCancelMove || !this.moveOrigin) return false;
    const actor = this.selected!;
    if (this.occupant(this.moveOrigin.x, this.moveOrigin.y)) return false;
    actor.x = this.moveOrigin.x;
    actor.y = this.moveOrigin.y;
    actor.moved = false;
    actor.movedTiles=0;
    this.moveOrigin = null;
    this.emit();
    return true;
  }

  effectiveMove(unit:Unit):number{return unit.move<=0?0:Math.max(1,unit.move+
    (unit.classId==="roverCavalry"?1:0)-statusPower(unit,"slow"));}
  combatStats(unit:Unit):CombatStats {
    const base=deriveCombat({...unit,stats:effectiveClassStats(unit.stats,unit.classId),
        weapon:this.committingWeapon?.get(unit.id)??resourceWeapon(unit)},
      TERRAIN_INFO[this.tile(unit.x,unit.y)].defense);
    const stats=unit.team==="ally"
      ? applyEquippedMasteries(base,unit.equippedMasteries):base;
    return {...stats,physicalProtection:Math.max(0,stats.physicalProtection+
        statusPower(unit,"wardArmor")+innatePhysicalProtection(unit,this.units)-
        statusPower(unit,"weakArmor")),
      magicalProtection:Math.max(0,stats.magicalProtection-statusPower(unit,"weakMagic")),
      avoid:stats.avoid+statusPower(unit,"evasion")+
        innateAvoid(unit,this.units,this.tile(unit.x,unit.y))};
  }
  hitChance(from:Unit,to:Unit,bonus=0):number {
    return clampChance(this.combatStats(from).hit-this.combatStats(to).avoid
      -defensiveAvoidBonus(from.weapon.category,to.weapon.category)+statusPower(to,"mark")+
      (to.classId==="duelist"&&to.duelTargetId===from.id?-8:0)+
      (statusPower(from,"meleeWeaken")&&from.weapon.kind==="physical"&&
       distance(from,to)===1?-5:0)+bonus);
  }
  criticalChance(from:Unit,to:Unit):number {
    return clampChance(this.combatStats(from).crit-this.combatStats(to).critAvoid);
  }
  /** W2 narrow art proof-of-contract. Full arts and menus arrive in S1. */
  readonly basicArt={id:"w2-power-strike",durabilityCost:3,damageBonus:2} as const;

  /** Combat art permissions are checked in the engine, never trusted from UI. */
  private activeArt(actor:Unit,id?:string):CombatArt|null {
    if(!id||!isCombatArtId(id)||actor.team!=="ally")return null;
    const art:CombatArt=COMBAT_ARTS[id];
    const weaponId=actor.inventory[actor.equippedIndex];
    if(!weaponId||weaponFor(weaponId).name!==actor.weapon.name||
      !canWield(actor.classId,weaponId,actor.weaponExp)||
      !actor.equippedArts.includes(id)||
      !unlockedCombatArts(actor.weaponExp).includes(id)||
      actor.weapon.category!==art.category||art.stationary&&actor.moved)return null;
    return art;
  }
  formalArtForWeapon(actor:Unit):CombatArt|null {
    const id=actor.equippedArts.find(id=>COMBAT_ARTS[id].category===actor.weapon.category);
    return id?this.activeArt(actor,id):null;
  }
  availableFormalArtWeapons(actor:Unit):number[]{
    if(this.phase!=="player"||actor.team!=="ally"||actor.hp<=0||
      actor.spent||actor.acted||this.result!=="playing")return [];
    return actor.inventory.flatMap((id,index)=>{
      if(!canWield(actor.classId,id,actor.weaponExp))return [];
      const candidate={...actor,weapon:weaponFor(id),equippedIndex:index};
      const art=this.formalArtForWeapon(candidate);
      if(!art)return [];
      const legal=art.target==="ally"?
        this.units.some(u=>this.previewSupport(candidate,u,"wardArmor")):
        this.units.some(u=>u.team!==actor.team&&this.forecastAttack(candidate,u,art.id));
      return legal?[index]:[];
    });
  }
  /** Job-exclusive moves are authorized by the CURRENT certified class and
   * CURRENT wieldable equipped weapon, never by persistent art slots. */
  private activeCareer(actor:Unit,id?:string):CareerArt|null{
    if(!id||!isCareerArtId(id)||actor.team!=="ally")return null;
    const art:CareerArt=CAREER_ARTS[id];
    const weaponId=actor.inventory[actor.equippedIndex];
    if(actor.classId!==art.classId||
       !actor.classLicenses.includes(art.classId)||
       !meetsWeaponRank(actor.weaponExp[art.category],
         art.classId==="scout"?"E":"D")||
       (art.classId==="scout"&&!meetsWeaponRank(actor.weaponExp.sword,"D"))||
       !weaponId||weaponFor(weaponId).name!==actor.weapon.name||
       !canWield(actor.classId,weaponId,actor.weaponExp)||
       actor.weapon.category!==art.category||
       (art.stationary&&actor.moved)||
       (art.minMoveTiles!==undefined&&actor.movedTiles<art.minMoveTiles))return null;
    return art;
  }
  currentCareerArt(actor:Unit):CareerArt|null{
    const art=careerArtForClass(actor.classId);
    return art?this.activeCareer(actor,art.id):null;
  }
  /** Legal candidate weapons are recomputed after class, movement and target changes. */
  availableCareerWeapons(actor:Unit):number[]{
    if(this.phase!=="player"||this.result!=="playing"||actor.team!=="ally"||
       actor.spent||actor.acted||actor.hp<=0)return [];
    const def=careerArtForClass(actor.classId);
    if(!def)return [];
    return actor.inventory.flatMap((weaponId,index)=>{
      if(!canWield(actor.classId,weaponId,actor.weaponExp))return [];
      const future={...actor,equippedIndex:index,weapon:weaponFor(weaponId)};
      const art=this.activeCareer(future,def.id);
      if(!art)return [];
      const allowed=art.target==="ally"?
        this.units.some(unit=>this.previewCareerSupport(future,unit,art.id)!==null):
        this.units.some(unit=>unit.team==="enemy"&&
          this.forecastAttack(future,unit,art.id)!==null);
      return allowed?[index]:[];
    });
  }
  /** Retreat is deterministic, one orthogonal cell AWAY from defeated target,
   * passable and unoccupied. Never jumps a cliff or an enemy.
   */
  private retreatPosition(actor:Unit,target:Unit):Point|null{
    if(distance(actor,target)!==1)return null;
    const cell={x:actor.x+(actor.x-target.x),y:actor.y+(actor.y-target.y)};
    if(!inBounds(cell.x,cell.y)||this.occupant(cell.x,cell.y)||
       !Number.isFinite(TERRAIN_INFO[this.tile(cell.x,cell.y)].moveCost))return null;
    return cell;
  }
  /** One authoritative specification builder for player, AI, preview and commit. */
  private attackSpec(attacker:Unit,defender:Unit,artId?:string):ActionSpec|null{
    if(this.result!=="playing"||attacker.hp<=0||defender.hp<=0||
      attacker.team===defender.team||attacker.spent||attacker.acted||
      !this.inAttackRange(attacker,defender))return null;
    const formal=this.activeArt(attacker,artId);
    const career=this.activeCareer(attacker,artId);
    if(artId===this.basicArt.id&&isSpell(attacker.weapon))return null;
    if(artId!==undefined&&artId!==this.basicArt.id&&!formal&&!career)return null;
    if(formal&&formal.target!=="enemy"||career&&career.target!=="enemy")return null;
    const bonus=formal?.id==="armor-sunder"&&
      (CLASS_LIBRARY[defender.classId].unitTags as readonly string[]).includes("Armored")?2:0;
    const art=artId===this.basicArt.id?this.basicArt:formal?
      {id:formal.id,durabilityCost:formal.cost,damageBonus:formal.damageBonus+bonus}:
      career?{id:career.id,durabilityCost:career.cost,damageBonus:career.damageBonus}:undefined;
    const spec=makeAttackAction(attacker,attacker.id,defender.id,art);
    return spec&&canPayActionCosts(attacker,spec.costs)?spec:null;
  }

  /** S1-0 read-only interface; previews do not spend resources or RNG. */
  previewAction(attacker:Unit,defender:Unit,artId?:string):ActionPreview|null{
    const spec=this.attackSpec(attacker,defender,artId);
    const forecast=spec?this.forecastAttack(attacker,defender,artId):null;
    return spec&&forecast?{spec,forecast}:null;
  }

  /** Pure forecast: normal hits land, no criticals. Actual combat uses seeded RNG. */
  forecastAttack(attacker:Unit,defender:Unit,artId?:string):AttackForecast|null {
    if(!this.attackSpec(attacker,defender,artId))return null;
    const formal=this.activeArt(attacker,artId);
    const career=this.activeCareer(attacker,artId);
    const extra=formal?.id==="armor-sunder"&&
      (CLASS_LIBRARY[defender.classId].unitTags as readonly string[]).includes("Armored")?2:0;
    const damage=Math.max(0,this.damage(attacker,defender)+
      innateDamageBonus(attacker,defender,true)-
      innateDamageBonus(attacker,defender,false)+
      (artId===this.basicArt.id?this.basicArt.damageBonus:formal?formal.damageBonus+extra:
        career?career.damageBonus:0));
    const counterDamage=this.damage(defender,attacker);
    const counterInRange=this.inAttackRange(defender,attacker);
    let hpA=attacker.hp,hpD=Math.max(0,defender.hp-previewDamage(defender,damage));
    const canCounter=counterInRange&&hpD>0;
    if(canCounter)hpA=Math.max(0,hpA-previewDamage(attacker,counterDamage));
    // This preview assumes normal hits, no criticals. Report a follow-up
    // only if both units would still be alive after the preceding strikes.
    const followUp=hpA>0&&hpD>0
      ? (formal?.noFollowUp||career?.noFollowUp?null:determineFollowUp(this.combatStats(attacker).attackSpeed,
        this.combatStats(defender).attackSpeed,canCounter))
      : null;
    const followUpDamage=followUp==="attacker"
      ? strikeDamage(this.damage(attacker,defender),attacker.weapon.category,false,true)
      : followUp==="defender"
        ? strikeDamage(counterDamage,defender.weapon.category,false,true) : 0;
    if(followUp==="attacker")hpD=Math.max(0,hpD-Math.max(0,followUpDamage-
      Math.max(0,statusPower(defender,"shield")-damage)));
    else if(followUp==="defender")hpA=Math.max(0,hpA-Math.max(0,followUpDamage-
      Math.max(0,statusPower(attacker,"shield")-counterDamage)));
    const projectedDefender=career?.effect==="meleeWeaken"?
      {...defender,statuses:[...defender.statuses.filter(s=>s.kind!=="meleeWeaken"),
        {kind:"meleeWeaken" as const,power:5,sourceId:attacker.id,
         expiresAfter:this.phaseSerial[defender.team]+1}]}:defender;
    const projected= formal?.effect==="evasion"?
      {...attacker,statuses:[...attacker.statuses.filter(s=>s.kind!=="evasion"),
        {kind:"evasion" as const,power:10,sourceId:attacker.id,
          expiresAfter:this.phaseSerial[attacker.team]+1}]}:attacker;
    const retreatTo=career?.retreatOnKill&&hpD===0&&hpA>0?
      this.retreatPosition(attacker,defender):null;
    return {damage,counterDamage:canCounter?counterDamage:0,canCounter,attackerHpAfter:hpA,defenderHpAfter:hpD,
      ...(career?{careerEffect:career.description,retreatTo}:{}),
      attackerHit:this.hitChance(attacker,defender,(formal?.hitBonus??0)+(career?.hitBonus??0)+
        innateHitBonus(attacker,defender,true,artId===undefined)+
        inheritedHitBonus(attacker,defender,true)),
      defenderHit:this.hitChance(projectedDefender,projected),
      attackerCrit:this.criticalChance(attacker,defender),
      defenderCrit:this.criticalChance(defender,attacker),followUp,followUpDamage,
      attackerTrait:traitLabel(attacker.weapon,defender.classId,followUp==="attacker"),
      defenderTrait:canCounter?traitLabel(defender.weapon,attacker.classId,followUp==="defender"):""};
  }

  private completedMovement(actor: Unit): string {
    return this.moveOrigin
      ? "移动至 (" + actor.x + ", " + actor.y + ") 后" : "";
  }

  private committedLog(action: string): void {
    this.logLine("第 " + this.round + " 回合 · " + action);
  }

  alive(team: Team): Unit[] {
    return this.units.filter(u => u.hp > 0 && u.team === team);
  }

  /** Complete only when every *living* ally has committed an attack or wait.
   * Dead allies do not block progression; an empty party is never a valid
   * auto-transition and terminal results always take precedence.
   */
  get allLivingAlliesSpent(): boolean {
    if (this.phase !== "player" || this.result !== "playing") return false;
    const allies = this.alive("ally");
    return allies.length > 0 && allies.every(unit => unit.spent);
  }
  occupant(x: number, y: number): Unit | undefined {
    return this.units.find(u => u.hp > 0 && u.x === x && u.y === y);
  }
  tile(x: number, y: number): Terrain {
    if (!inBounds(x, y)) return "#";
    return this.terrain[y]![x] as Terrain;
  }

  /** Minimum weighted traversal costs. Living teammates may be crossed
   * at the normal terrain cost, while living enemies and cliffs still block.
   * Do not expose this map as legal move endpoints: occupied friendly tiles
   * are transit-only. Both teams share the same rule.
   */
  private movementCosts(actor: Unit): Map<string, number> {
    const best = new Map<string, number>();
    if (actor.hp <= 0) return best;
    best.set(key(actor), 0);
    const queue: Array<{ x: number; y: number; cost: number }> =
      [{ x: actor.x, y: actor.y, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (current.cost !== best.get(key(current))) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = current.x + dx!, y = current.y + dy!;
        if (!inBounds(x, y)) continue;
        const occupant = this.occupant(x, y);
        if (occupant && occupant.team !== actor.team) continue;
        const cost = current.cost + terrainStepCost(actor,this.tile(x,y),
          TERRAIN_INFO[this.tile(x, y)].moveCost);
        if (cost > this.effectiveMove(actor) || cost >= (best.get(key({ x, y })) ?? Infinity)) continue;
        best.set(key({ x, y }), cost);
        queue.push({ x, y, cost });
      }
    }
    return best;
  }

  /** Legal stopping tiles only. Teammates are pass-through, never endpoints.
   * The actor's own origin remains reachable with cost zero.
   */
  reachable(actor: Unit): Map<string, number> {
    const best = this.movementCosts(actor);
    const origin = key(actor);
    for (const position of best.keys()) {
      if (position === origin) continue;
      const [x, y] = position.split(",").map(Number);
      if (this.occupant(x!, y!)) best.delete(position);
    }
    return best;
  }

  /** Shared, read-only projection for both teams based on equipped weapon. */
  private projectedThreat(unit: Unit, endpoints: Iterable<string>): EnemyThreat {
    const move = new Set<string>();
    const attack = new Set<string>();
    for (const position of endpoints) {
      move.add(position);
      if(!canUseAttack(unit))continue;
      const [px, py] = position.split(",").map(Number);
      for (let dy = -unit.weapon.maxRange; dy <= unit.weapon.maxRange; dy++) {
        for (let dx = -unit.weapon.maxRange; dx <= unit.weapon.maxRange; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < unit.weapon.minRange || d > unit.weapon.maxRange) continue;
          const x = px! + dx, y = py! + dy;
          if (!inBounds(x, y) || this.tile(x, y) === "#") continue;
          if (this.occupant(x, y)?.team === unit.team) continue;
          attack.add(key({x, y}));
        }
      }
    }
    return {move, attack};
  }

  /** Enemy move/attack zone; inspection only, no combat mutation. */
  enemyThreat(enemy: Unit): EnemyThreat {
    if (this.result !== "playing" || enemy.team !== "enemy" || enemy.hp <= 0)
      return {move: new Set(), attack: new Set()};
    return this.projectedThreat(enemy, this.reachable(enemy).keys());
  }

  /** Before move: attacks from all weighted movement endpoints.
   * After move: attacks from present tile only. Spent units are hidden.
   */
  allyThreat(ally: Unit): EnemyThreat {
    if (this.phase !== "player" || this.result !== "playing" ||
        ally.team !== "ally" || ally.hp <= 0 || ally.spent || ally.acted ||
        !this.units.includes(ally))
      return {move: new Set(), attack: new Set()};
    return this.projectedThreat(ally,
      ally.moved ? [key(ally)] : this.reachable(ally).keys());
  }

  /** A legal destination preview used by BOTH teams. This does not commit
   * movement, attack or consume a random number. An ally who already moved
   * may only preview from its current position.
   */
  previewMovementAttack(unit: Unit, destination: Point): {path: Point[];attack:Set<string>} | null {
    if (this.result !== "playing" || unit.hp <= 0 || !this.units.includes(unit))
      return null;
    if (unit.team === "ally" &&
        (this.phase !== "player" || unit.spent || unit.acted ||
         (unit.moved && key(unit) !== key(destination)))) return null;
    const path = this.movementPath(unit, destination);
    if (!path) return null;
    return {path,attack:this.projectedThreat(unit,[key(destination)]).attack};
  }

  /** Returns a minimum movement-cost path, including origin and destination.
   * Uses the exact reachable() terrain weights and occupancy; no state mutation.
   */
  movementPath(actor: Unit, destination: Point): Point[] | null {
    if (!inBounds(destination.x, destination.y)) return null;
    const target = this.occupant(destination.x, destination.y);
    if (target && (target.id !== actor.id || target !== actor)) return null;
    // Reconstruct over transit-only friendly tiles as well as empty tiles.
    const costs = this.movementCosts(actor);
    if (!costs.has(key(destination))) return null;
    const path: Point[] = [{x: destination.x, y: destination.y}];
    let current = path[0]!;
    while (current.x !== actor.x || current.y !== actor.y) {
      const cost = costs.get(key(current))!;
      const entering = terrainStepCost(actor,this.tile(current.x,current.y),
        TERRAIN_INFO[this.tile(current.x, current.y)].moveCost);
      const previous = [
        {x: current.x - 1, y: current.y},
        {x: current.x, y: current.y - 1},
        {x: current.x + 1, y: current.y},
        {x: current.x, y: current.y + 1},
      ].find(p => costs.get(key(p)) === cost - entering);
      if (!previous) return null;
      path.push(previous);
      current = previous;
    }
    return path.reverse();
  }

  inAttackRange(attacker: Unit, defender: Unit): boolean {
    if(attacker.weapon.effect==="heal")return false;
    const d = distance(attacker, defender);
    if(!canUseAttack(attacker))return false;
    const active=activeWeaponId(attacker);
    // Real equipped inventory is authoritative for category and weapon rank.
    // Isolated combat tests can still use synthetic weapon mocks.
    if(active&&attacker.inventory[attacker.equippedIndex]===active&&
        !canWield(attacker.classId,active,attacker.weaponExp))return false;
    return d >= attacker.weapon.minRange && d <= attacker.weapon.maxRange;
  }
  targets(actor: Unit): Unit[] {
    return this.alive(actor.team === "ally" ? "enemy" : "ally")
      .filter(u => this.inAttackRange(actor, u));
  }
  damage(attacker:Unit,defender:Unit):number {
    const to=this.combatStats(defender);
    const from=effectiveClassStats(attacker.stats,attacker.classId);
    const might=effectiveMight(this.committingWeapon?.get(attacker.id)??
      resourceWeapon(attacker),defender.classId);
    const base=attacker.weapon.kind==="magical"
      ? from.magic+might-to.magicalProtection
      : from.strength+might-to.physicalProtection;
    const nominal=strikeDamage(Math.max(0,base+
      innateDamageBonus(attacker,defender,false)),attacker.weapon.category);
    return Math.max(0,nominal-innateReduction(attacker,defender));
  }

  click(x: number, y: number): void {
    if(this.campaignEnabled&&this.campaignStage!=="battle")return;
    if (this.phase !== "player" || this.result !== "playing" || !inBounds(x, y)) return;
    const found = this.occupant(x, y);
    if (found?.team === "ally") {
      if (!found.spent) {
        // Do not leave a different ally's tentative move stranded.
        if (this.selectedId !== found.id && this.canCancelMove) this.cancelMove();
        this.selectedId = found.id;
        this.emit();
      }
      return;
    }
    const actor = this.selected;
    if (!actor || actor.spent) return;
    if (found?.team === "enemy") {
      this.commitSelectedAttack(actor,found);
      return;
    }
    if (actor.moved) return;
    if (!this.reachable(actor).has(key({ x, y }))) return;
    this.preparationOpen=false;
    this.moveOrigin = {x: actor.x, y: actor.y};
    actor.movedTiles=Math.max(0,(this.movementPath(actor,{x,y})?.length??1)-1);
    actor.x = x;
    actor.y = y;
    actor.moved = true;
    // A tentative move is NOT a completed action and must not enter the log.
    this.emit();
  }

  /** S1 will expose a dedicated art choice in the battle UI.
   * W2 exposes one sample art through the same committed battle path to
   * verify durability costs without opening the full skill system.
   */
  useCombatArt(actor:Unit,defender:Unit,artId:string):boolean {
    if(this.phase!=="player"||this.result!=="playing"||
      actor.team!=="ally"||defender.team!=="enemy"||
      this.selected?.id!==actor.id)return false;
    return this.commitSelectedAttack(actor,defender,artId);
  }

  /** Atomic S1-0 attack entry. Costs are reserved before any RNG, damage or XP. */
  private commitAttackAction(actor:Unit,defender:Unit,artId?:string):ReturnType<Battle["strike"]>|null{
    // Read-only enemy projections may use a cloned position; committing may not.
    if(!this.units.includes(actor)||!this.units.includes(defender))return null;
    const preview=this.previewAction(actor,defender,artId);
    if(!preview)return null;
    const {spec}=preview;
    const preserved=resourceWeapon(actor);
    if(!payActionCosts(actor,spec.costs))return null;
    this.committingWeapon=new Map([[actor.id,preserved]]);
    let result:ReturnType<Battle["strike"]>;
    try{
      result=this.strike(actor,defender,artId);
    }finally{
      this.committingWeapon=null;
    }
    this.lastActionEvents=[
      {kind:"confirmed",actorId:actor.id,targetId:defender.id,actionId:spec.actionId},
      ...spec.costs.map(cost=>({kind:"resource" as const,actorId:actor.id,
        targetId:defender.id,actionId:spec.actionId,cost:{...cost}})),
      ...this.lastCombatEvents.map(combat=>({kind:"strike" as const,
        actorId:actor.id,targetId:defender.id,actionId:spec.actionId,
        combat:{...combat}})),
    ];
    return result;
  }

  private commitSelectedAttack(actor:Unit,defender:Unit,artId?:string):boolean {
    if(this.selected?.id!==actor.id||actor.team!=="ally"||
      !this.units.includes(defender))return false;
    const result=this.commitAttackAction(actor,defender,artId);
    if(!result)return false;
    this.preparationOpen=false;
    const moved=this.completedMovement(actor);
    if(isCareerArtId(artId)&&("retreatOnKill" in CAREER_ARTS[artId])&&
       result.defenderFell&&actor.hp>0){
      const retreat=this.retreatPosition(actor,defender);
      if(retreat){
        actor.x=retreat.x;actor.y=retreat.y;
        this.committedLog(actor.name+" 击败目标后回退至("+retreat.x+","+retreat.y+")");
      }
    }
    const action=artId===this.basicArt.id?"使用试验战技攻击":
      isCombatArtId(artId)?"使用"+COMBAT_ARTS[artId].name+"攻击":
      isCareerArtId(artId)?"使用"+CAREER_ARTS[artId].name+"攻击":"攻击";
    this.committedLog(actor.name+(moved?" "+moved:"")+action+" "+defender.name+
      "：造成 "+result.damage+" 点伤害"+
      (result.counterDamage>0?"；"+defender.name+"反击造成 "+result.counterDamage+" 点伤害":"")+
      (result.defenderFell?"；目标被击败":"")+
      (result.attackerFell?"；攻击者被击败":"")+result.detail);
    actor.acted=true;actor.spent=true;
    this.moveOrigin=null;this.selectedId=null;
    this.resolve();this.emit();
    return true;
  }

  waitSelected(): void {
    if (this.phase !== "player" || this.result !== "playing") return;
    const actor = this.selected;
    if (!actor || actor.team !== "ally" || actor.spent) return;
    this.preparationOpen=false;
    const trained=actor.team==="ally"
      ? gainClassExperience(actor.classExperience,actor.classId,4) : {gained:0,mastered:false};
    this.committedLog(actor.name + " " + this.completedMovement(actor) + "待机"+
      (trained.mastered?"；"+CLASS_LIBRARY[actor.classId].name+"精通":""));
    actor.spent = true;
    actor.acted = true;
    this.moveOrigin = null;
    this.selectedId = null;
    this.resolve();
    this.emit();
  }

  /** Player-facing legacy entry point: runs the same sequential API without delays.
   * Browser uses begin/plan/commit/finish for one-by-one presentation.
   */
  endTurn(): void {
    if (!this.beginEnemyTurn()) return;
    while (this.result === "playing") {
      const plan = this.planEnemyAction();
      if (!plan) break;
      this.commitEnemyAction(plan);
    }
    this.finishEnemyTurn();
  }

  /** Resolve temporary effects at team-phase boundaries, never per unit click. */
  private startEffects(team:Team):void{
    this.phaseSerial[team]++;
    for(const unit of this.units.filter(u=>u.team===team&&u.hp>0)){
      const lost=startStatusPhase(unit,this.phaseSerial[team]);
      if(lost)this.committedLog(unit.name+" 受到灼烧 "+lost+" 点伤害");
    }
  }
  private finishEffects(team:Team):void{
    for(const unit of this.units.filter(u=>u.team===team))
      finishStatusPhase(unit,this.phaseSerial[team]);
  }
  /** Class-specific blessing shares the S1-2 healing pipeline, without
   * installing a generic art or allowing unsolicited extra healing. */
  previewCareerSupport(actor:Unit,target:Unit,id:string):SupportPreview|null {
    return id==="life-gift"&&this.activeCareer(actor,id)?
      this.previewSupport(actor,target,"heal",id):null;
  }
  commitCareerSupport(actor:Unit,target:Unit,id:string):boolean{
    if(id!=="life-gift"||!this.activeCareer(actor,id))return false;
    return this.commitSupport(actor,target,"heal",id);
  }
  /** S1-2 support actions are battle-only, not campaign progression. */
  private supportSpec(actor:Unit,target:Unit,effect:SupportEffect,careerId?:string):ActionSpec|null{
    if(!["heal","shield","burn","slow","weakArmor","weakMagic","mark","wardArmor"].includes(effect)||
      actor.hp<=0||target.hp<=0||actor.spent||actor.acted||
      this.result!=="playing"||this.phase!=="player"||actor.team!=="ally"||
      (this.campaignEnabled&&this.campaignStage!=="battle"))return null;
    const weaponId=activeWeaponId(actor);
    if(!weaponId||actor.inventory[actor.equippedIndex]!==weaponId||
      !canWield(actor.classId,weaponId,actor.weaponExp))return null;
    if(careerId!==undefined&&(careerId!=="life-gift"||effect!=="heal"||
      !this.activeCareer(actor,careerId)))return null;
    const friendly=effect==="heal"||effect==="shield"||effect==="wardArmor";
    if(effect==="wardArmor"&&!this.activeArt(actor,"ward-prayer"))return null;
    if((actor.team===target.team)!==friendly)return null;
    if((actor.weapon.effect==="heal")!==friendly)return null;
    if(!friendly&&actor.weapon.category!=="dark")return null;
    const d=distance(actor,target);
    if(d<actor.weapon.minRange||d>actor.weapon.maxRange)return null;
    if(effect==="heal"&&target.hp>=target.maxHp)return null;
    if(effect==="shield"&&statusPower(target,"shield")>=3)return null;
    if(effect==="wardArmor"&&statusPower(target,"wardArmor")>=2)return null;
    const spec=makeSupportAction(actor,actor.id,target.id,
      effect==="heal"?"heal":friendly?"shield":"status",
      effect==="shield"||effect==="wardArmor"||careerId==="life-gift"?2:1);
    return spec&&canPayActionCosts(actor,spec.costs)?spec:null;
  }
  previewSupport(actor:Unit,target:Unit,effect:SupportEffect,careerId?:string):SupportPreview|null{
    const spec=this.supportSpec(actor,target,effect,careerId);
    if(!spec)return null;
    const power=effect==="heal"?
      Math.max(1,5+Math.floor(effectiveClassStats(actor.stats,actor.classId).magic/2)+
        innateHealBonus(actor)+(careerId==="life-gift"?4:0)):
      effect==="shield"?3:effect==="wardArmor"?2:
      effect==="burn"||effect==="weakArmor"||
      effect==="weakMagic"?2:effect==="mark"?5:1;
    return {effect,value:effect==="heal"?Math.min(power,target.maxHp-target.hp):power,
      cost:spec.costs[0]!.amount,remaining:remainingSpellCharges(actor)??0,resistChance:0};
  }
  commitSupport(actor:Unit,target:Unit,effect:SupportEffect,careerId?:string):boolean{
    if(this.selectedId!==actor.id||!this.units.includes(actor)||!this.units.includes(target))
      return false;
    const preview=this.previewSupport(actor,target,effect,careerId);
    const spec=preview?this.supportSpec(actor,target,effect,careerId):null;
    if(!spec||!preview||!payActionCosts(actor,spec.costs))return false;
    const before=target.hp;
    if(effect==="heal")target.hp=Math.min(target.maxHp,target.hp+preview.value);
    else{
      const prolong=actor.equippedMasteries.includes("lastingHex")&&
        (effect==="slow"||effect==="weakArmor"||effect==="weakMagic")?1:0;
      applyStatus(target,effect,this.phaseSerial[target.team]+1+prolong,actor.id,preview.value);
    }
    const restored=target.hp-before;
    actor.acted=true;actor.spent=true;this.moveOrigin=null;this.selectedId=null;
    this.lastCombatEvents=[];
    this.lastActionEvents=[
      {kind:"confirmed",actorId:actor.id,targetId:target.id,
        actionId:careerId==="life-gift"?"life-gift":
          effect==="wardArmor"?"ward-prayer":effect},
      {kind:"resource",actorId:actor.id,targetId:target.id,
        actionId:careerId==="life-gift"?"life-gift":
          effect==="wardArmor"?"ward-prayer":effect,
        cost:{...spec.costs[0]!}},
    ];
    this.committedLog(actor.name+(careerId==="life-gift"?" 施放生命赐福 → ":
      effect==="heal"?" 治疗 ":" 施放 "+effect+" → ")+
      target.name+(effect==="heal"?"：恢复 "+restored+" HP":""));
    if(restored>0){
      gainClassExperience(actor.classExperience,actor.classId,6);
      awardWeaponExperience(actor.weaponExp,actor.classId,"white",4);
    }
    this.resolve();this.emit();return true;
  }
  availableSupportWeapons(actor:Unit,effect:SupportEffect):number[]{
    if(this.phase!=="player"||actor.team!=="ally"||actor.hp<=0||actor.spent||
      actor.acted)return [];
    return actor.inventory.flatMap((id,index)=>{
      if(!canWield(actor.classId,id,actor.weaponExp))return [];
      const candidate={...actor,weapon:weaponFor(id),equippedIndex:index};
      return this.units.some(u=>this.previewSupport(candidate,u,effect))?[index]:[];
    });
  }

  beginEnemyTurn(): boolean {
    if(this.campaignEnabled&&this.campaignStage!=="battle")return false;
    if (this.phase !== "player" || this.result !== "playing") return false;
    // Resolve pre-existing terminal states (e.g. the final ally already at 0 HP).
    this.resolve();
    if (this.result !== "playing") {
      this.emit();
      return false;
    }
    this.preparationOpen=false;
    this.finishEffects("ally");
    for(const unit of this.units.filter(u=>u.team==="ally"))unit.focusReady=false;
    this.phase = "enemy";
    this.startEffects("enemy");
    this.selectedId = null;
    this.moveOrigin = null;
    this.alive("ally").forEach(u => { u.spent = true; });
    this.enemyQueue = this.alive("enemy").map(u => u.id);
    this.emit();
    return true;
  }

  /** Does not move, attack, log or alter the pending queue. */
  planEnemyAction(): EnemyActionPlan | null {
    if (this.phase !== "enemy" || this.result !== "playing") return null;
    const id = this.enemyQueue[0];
    if (!id) return null;
    const enemy = this.units.find(u => u.id === id && u.hp > 0);
    if (!enemy) return null; // Queue is static; currently dead enemies cannot be acted.
    const foes = this.alive("ally");
    if (!foes.length) return null;
    const nearest = this.nearest(enemy, foes);
    let destination = {x: enemy.x, y: enemy.y};
    if (!enemy.holdPosition&&!this.inAttackRange(enemy, nearest)) {
      let best = this.approachScore(enemy, nearest);
      for (const position of this.reachable(enemy).keys()) {
        const [x, y] = position.split(",").map(Number);
        const candidate = {x: x!, y: y!};
        const score = this.approachScore(candidate, nearest);
        if (score < best) { destination = candidate; best = score; }
      }
    }
    const future = {...enemy, x: destination.x, y: destination.y};
    const attackable = foes.filter(u => this.inAttackRange(future, u));
    const target = [...attackable].sort((a, b) =>
      (this.damage(enemy, b) >= b.hp ? 1 : 0) -
      (this.damage(enemy, a) >= a.hp ? 1 : 0) || a.hp - b.hp)[0];
    return {unitId: enemy.id, destination,
      path: this.movementPath(enemy, destination) ?? [{x:enemy.x,y:enemy.y}],
      targetId: target?.id ?? null};
  }

  /** Commits exactly one enemy's completed action and emits a single state change. */
  commitEnemyAction(plan: EnemyActionPlan): boolean {
    if (this.phase !== "enemy" || this.result !== "playing" ||
        this.enemyQueue[0] !== plan.unitId) return false;
    const enemy = this.units.find(u => u.id === plan.unitId && u.hp > 0);
    if (!enemy || !this.movementPath(enemy, plan.destination)) return false;
    const start = {x: enemy.x, y: enemy.y};
    enemy.movedTiles=Math.max(0,
      (this.movementPath(enemy,plan.destination)?.length??1)-1);
    enemy.x = plan.destination.x;
    enemy.y = plan.destination.y;
    const moved = start.x !== enemy.x || start.y !== enemy.y;
    enemy.moved=moved;
    const prefix = enemy.name + (moved
      ? " 移动至 (" + enemy.x + ", " + enemy.y + ") 后" : " ");
    const target = this.units.find(u => u.id === plan.targetId && u.hp > 0);
    const result=target?this.commitAttackAction(enemy,target):null;
    if(result){
      this.committedLog(prefix + "攻击 " + target!.name + "：造成 " +
        result.damage + " 点伤害" +
        (result.counterDamage ? "；" + target!.name + "反击造成 " + result.counterDamage + " 点伤害" : "") +
        (result.defenderFell ? "；目标被击败" : "") +
        (result.attackerFell ? "；攻击者被击败" : "") + result.detail);
    }else{
      this.lastCombatEvents=[];
      this.lastActionEvents=[];
      this.committedLog(enemy.name + (moved
        ? " 移动至 (" + enemy.x + ", " + enemy.y + ")" : " 待机"));
    }
    enemy.spent = true;
    this.enemyQueue.shift();
    this.resolve();
    this.emit();
    return true;
  }

  finishEnemyTurn(): boolean {
    if (this.phase !== "enemy" || this.enemyQueue.length !== 0) return false;
    this.enemyQueue = [];
    this.finishEffects("enemy");
    for(const unit of this.units.filter(u=>u.team==="enemy"))unit.focusReady=false;
    this.phase = "player";
    if (this.result === "playing") {
      this.startEffects("ally");
      this.round++;
      for (const unit of this.alive("ally")) {
        unit.moved = false; unit.acted = false; unit.spent = false;
        unit.movedTiles=0;unit.duelTargetId=null;
      }
      for (const unit of this.alive("enemy")) {
        unit.moved = false; unit.acted = false; unit.spent = false;
        unit.movedTiles=0;unit.focusReady=false;unit.duelTargetId=null;
      }
    }
    this.emit();
    return true;
  }

  private approachScore(from: Point, target: Unit): number {
    const d = distance(from, target);
    return d > target.weapon.maxRange ? d : Math.max(0, d - 1) * 2;
  }
  private nearest(from: Point, candidates: Unit[]): Unit {
    return [...candidates].sort((a, b) => distance(from, a) - distance(from, b))[0]!;
  }
  private strike(actor:Unit,defender:Unit,artId?:string):{
    damage:number;counterDamage:number;defenderFell:boolean;attackerFell:boolean;detail:string;
  } {
    // Caller has validated and paid the action before rolling any combat RNG.
    // committingWeapon preserves pre-payment might/hit for a breaking weapon.
    let damage=0,counterDamage=0,misses=0,crits=0,countered=false;
    const formal=this.activeArt(actor,artId);
    const career=this.activeCareer(actor,artId);
    const castersCharged=new Set<string>();
    if(isSpell(actor.weapon))castersCharged.add(actor.id);
    const events: CombatEvent[] = [];
    this.lastCombatEvents = [];
    let strikeIndex=0;
    const hit=(from:Unit,to:Unit,followUp=false):number=>{
      if(from.hp<=0||to.hp<=0)return 0;
      if(isSpell(from.weapon)&&!castersCharged.has(from.id)){
        const counterSpec=makeAttackAction(from,from.id,to.id);
        if(!counterSpec||!payActionCosts(from,counterSpec.costs))
          throw Error("Insufficient spell charges for committed counterattack");
        castersCharged.add(from.id);
      }
      const first=from===actor&&strikeIndex===0;
      const bonus=first?(formal?.hitBonus??0)+(career?.hitBonus??0)+
        innateHitBonus(from,to,true,!artId)+
        inheritedHitBonus(from,to,true):0;
      const missed=!this.roll(this.hitChance(from,to,bonus));
      if(!missed&&from.weapon.kind==="physical"&&distance(from,to)===1&&
         statusPower(from,"meleeWeaken")>0)removeStatus(from,"meleeWeaken");
      if(missed&&from.weapon.kind==="physical"&&distance(from,to)===1&&
         statusPower(from,"meleeWeaken")>0)removeStatus(from,"meleeWeaken");
      if(missed&&(to.classId==="martialArtist"||
         to.equippedMasteries.includes("slipFocus")))to.focusReady=true;
      if(missed) misses++;
      const critical=!missed && this.roll(this.criticalChance(from,to));
      if(critical) crits++;
      const armor=formal?.id==="armor-sunder"&&
        (CLASS_LIBRARY[to.classId].unitTags as readonly string[]).includes("Armored")?2:0;
      const artBonus=first?((artId===this.basicArt.id?this.basicArt.damageBonus:
        formal?formal.damageBonus+armor:career?career.damageBonus:0)+
        innateDamageBonus(from,to,true)-innateDamageBonus(from,to,false)):0;
      const amount=missed?0:strikeDamage(Math.max(0,this.damage(from,to)+artBonus),
        from.weapon.category,critical,followUp);
      const impact=absorbDamage(to,amount);
      if(first){
        from.focusReady=false;
        if(from.classId==="duelist"&&from.weapon.kind==="physical"&&
          Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1)
          from.duelTargetId=to.id;
      }
      if(first&&!missed&&to.hp>0&&career?.effect){
        const delay=from.equippedMasteries.includes("lastingHex")&&
          (career.effect==="slow"||career.effect==="weakArmor"||
           career.effect==="weakMagic")?1:0;
        applyStatus(to,career.effect,this.phaseSerial[to.team]+1+delay,from.id);
      }
      if(first&&!missed&&to.hp>0&&formal&&
        (formal.effect==="slow"||formal.effect==="weakArmor")){
        const extra=from.equippedMasteries.includes("lastingHex")?1:0;
        applyStatus(to,formal.effect,this.phaseSerial[to.team]+1+extra,actor.id);
      }
      events.push({kind: strikeIndex++===0?"attack":from.id===actor.id?"follow-up":
        events.some(e=>e.fromId===from.id)?"follow-up":"counter",
        fromId:from.id,toId:to.id,missed,critical,damage:impact.hpLoss,
        absorbed:impact.absorbed,
        fromHpAfter:from.hp,toHpAfter:to.hp,defeated:to.hp===0});
      return impact.hpLoss;
    };
    damage+=hit(actor,defender);
    if(formal?.effect==="evasion"&&actor.hp>0)
      applyStatus(actor,"evasion",this.phaseSerial[actor.team]+1,actor.id,10);
    const canCounter=defender.hp>0&&actor.hp>0&&this.inAttackRange(defender,actor);
    if(canCounter){
      countered=true;counterDamage+=hit(defender,actor);
    }
    // Actual survival may differ from the normal-hit forecast (e.g. a miss).
    // Compute the legal follow-up from the committed state, not preview text.
    if(actor.hp>0&&defender.hp>0){
      const followUp=formal?.noFollowUp||career?.noFollowUp?null:
        determineFollowUp(this.combatStats(actor).attackSpeed,
        this.combatStats(defender).attackSpeed,canCounter);
      if(followUp==="attacker")damage+=hit(actor,defender,true);
      else if(followUp==="defender"){
        countered=true;counterDamage+=hit(defender,actor,true);
      }
    }
    this.lastCombatEvents = events.map(event=>({...event}));
    let levelNote="";
    // Experience is granted once per committed encounter, after all hits.
    // Counterattacks train even on misses; follow-ups do not grant extra XP.
    const gainedNotes:string[]=[];
    for(const [unit,base] of [
      [actor,artId?6:4],
      [defender,2],
    ] as const){
      if(!events.some(event=>event.fromId===unit.id))continue;
      const result=awardWeaponExperience(unit.weaponExp,unit.classId,
        unit.weapon.category,base);
      if(result.to!==result.from)
        gainedNotes.push(unit.name+" "+unit.weapon.category+" "+result.from+"→"+result.to);
    }
    if(gainedNotes.length)levelNote+="；熟练度升级 "+gainedNotes.join("、");
    // Once per participant per committed encounter: hits, misses and follow-ups
    // do not multiply job XP. Enemy job progress is not campaign progression.
    for(const [unit,amount] of [[actor,10],[defender,5]] as const){
      if(unit.team!=="ally"||
        !events.some(event=>event.fromId===unit.id))continue;
      const trained=gainClassExperience(unit.classExperience,unit.classId,amount);
      if(trained.mastered)
        levelNote+="；"+unit.name+" "+CLASS_LIBRARY[unit.classId].name+"精通";
    }
    if(actor.team==="ally"&&actor.hp>0){
      if(awardExperience(actor,10+(defender.hp===0?25:0),()=>this.nextRandom(),
          effectiveClassGrowths(actor.growths,actor.classId)))
        levelNote+="；"+actor.name+" Lv."+actor.level;
    }
    if(defender.team==="ally"&&defender.hp>0&&countered){
      if(awardExperience(defender,10,()=>this.nextRandom(),
          effectiveClassGrowths(defender.growths,defender.classId)))
        levelNote+="；"+defender.name+" Lv."+defender.level;
    }
    return {damage,counterDamage,defenderFell:defender.hp<=0,attackerFell:actor.hp<=0,
      detail:(misses?"；未命中 "+misses+" 次":"")+(crits?"；必杀 "+crits+" 次":"")+levelNote};
  }
  private resolve(): void {
    if (!this.alive("ally").length) {
      this.result = "defeat";
    } else if (objectiveComplete(this.currentLevel.victory,this.units)) {
      this.result = "victory";
    }
    if (this.result !== "playing") {
      if(this.campaignEnabled&&this.campaignStage==="battle"){
        // Atomic terminal transition: one outcome, one fixed payout.
        // No reward processing in the UI, save/restore, or return-to-camp.
        const earned=calculateSortieReward(this.result);
        const credited=creditSortieReward(this.preparationFunds,earned);
        this.preparationFunds=credited.funds;
        this.sortiesCompleted++;
        if(this.result==="victory"){
          this.ridingPermit=true;
          if(!this.completedLevelIds.includes(this.selectedLevelId))
            this.completedLevelIds.push(this.selectedLevelId);
        }
        this.pendingSettlement=settlementFrom(this.result,this.sortiesCompleted,
          this.sortieStart?.allies??this.aliveAndDefeatedAllies().map(captureAlly),
          this.units,credited.awarded);
        this.pendingSettlement.levelId=this.selectedLevelId;
        this.campaignStage="settlement";
      }
      this.selectedId = null;
      this.moveOrigin = null;
      // No additional enemy actions occur once the battle is over.
      this.enemyQueue = [];
    }
  }
  private logLine(line: string): void {
    this.log.push(line);
    if (this.log.length > 12) this.log.shift();
  }
  private emit(): void { this.onChange?.(); }
}
