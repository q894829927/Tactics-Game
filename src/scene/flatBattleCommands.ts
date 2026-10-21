/** Tactical command menu:
 * first level: six stable categories (undo is conditional);
 * second level: one ungrouped list of the actor's actual arts or spells.
 * Each executable choice carries the legal inventory slot it needs.
 */
import {Battle,type Unit,type SupportEffect} from "../engine/battle.ts";
import {WEAPON_LIBRARY,weaponFor,canWield} from "../engine/weapons.ts";
import {careerArtForClass} from "../engine/careerArts.ts";

export type CommandGroup="attack"|"art"|"magic"|"inventory"|"wait"|"undo";
export type FlatCommand={
 key:string; label:string;icon:string;enabled:boolean;hint:string;
 action:"attack"|"art"|"career"|"support"|"career-support"|"inventory"|"wait"|"undo"|"submenu"|"none";
 group:CommandGroup;weaponIndex?:number;artId?:string;effect?:SupportEffect;
};
const effects:readonly {effect:SupportEffect;name:string}[]=[
 {effect:"burn",name:"灼烧"},{effect:"slow",name:"缓足"},
 {effect:"weakArmor",name:"弱甲"},{effect:"weakMagic",name:"弱咒"},
 {effect:"mark",name:"标记"},
];
const item=(key:string,label:string,icon:string,group:CommandGroup,
  action:FlatCommand["action"],enabled:boolean,hint:string,
  other:Partial<FlatCommand>={}):FlatCommand=>
  ({key,label,icon,group,action,enabled,hint,...other});

/** Reads all owned weapon slots without changing current equipment. */
export function skillSubmenuCommands(battle:Battle,actor:Unit,
  group:"art"|"magic"):FlatCommand[]{
  const choices:FlatCommand[]=[];
  const attacks=battle.availableAttackWeapons(actor);
  const basics=battle.availableArtWeapons(actor);
  const formals=battle.availableFormalArtWeapons(actor);
  const careers=battle.availableCareerWeapons(actor);
  const careerArt=careerArtForClass(actor.classId);
  const supported=(unit:Unit,effect:SupportEffect,careerId?:string)=>
    battle.units.some(target=>careerId?
      battle.previewCareerSupport(unit,target,careerId)!==null:
      battle.previewSupport(unit,target,effect)!==null);
  for(const [index,id] of actor.inventory.entries()){
    if(!canWield(actor.classId,id,actor.weaponExp))continue;
    const weapon=weaponFor(id);
    const candidate={...actor,weapon,equippedIndex:index,
      minRange:weapon.minRange,maxRange:weapon.maxRange};
    const magical=weapon.kind==="magical";
    if(group==="art"){
      if(!magical){
        const formal=battle.formalArtForWeapon(candidate);
        if(formal&&formal.target==="enemy")
          choices.push(item("formal-"+index+"-"+formal.id,formal.name,"✦","art","art",
            formals.includes(index),formal.description,{weaponIndex:index,artId:formal.id}));
        if(careerArt&&careerArt.target==="enemy"){
          const active=battle.currentCareerArt(candidate);
          if(active)choices.push(item("career-"+index+"-"+active.id,active.name,"◆","art",
            "career",careers.includes(index),active.description,
            {weaponIndex:index,artId:active.id}));
        }
        choices.push(item("basic-"+index,"强击","✧","art","art",
          basics.includes(index),"普通物理战技，消耗3点武器耐久",
          {weaponIndex:index,artId:battle.basicArt.id}));
      }else{
        // Magical job-specific offensive arts are arts, not ordinary spells.
        const active=battle.currentCareerArt(candidate);
        if(active&&active.target==="enemy")
          choices.push(item("career-"+index+"-"+active.id,active.name,"◆","art","career",
            careers.includes(index),active.description,
            {weaponIndex:index,artId:active.id}));
      }
    }else{
      if(!magical)continue;
      if(weapon.effect==="heal"){
        for(const [effect,name] of [["heal",weapon.name],["shield","护盾"]] as const)
          choices.push(item("support-"+index+"-"+effect,name,"✚","magic","support",
            supported(candidate,effect),effect==="heal"?"恢复受伤友军生命":"为友军提供护盾",
            {weaponIndex:index,effect}));
        const active=battle.currentCareerArt(candidate);
        if(active?.target==="ally")
          choices.push(item("career-"+index+"-"+active.id,active.name,"◆","magic",
            "career-support",careers.includes(index)&&supported(candidate,"heal",active.id),
            active.description,{weaponIndex:index,artId:active.id}));
        const formal=battle.formalArtForWeapon(candidate);
        if(formal?.target==="ally")
          choices.push(item("formal-"+index+"-"+formal.id,formal.name,"✧","magic",
            "support",formals.includes(index),formal.description,
            {weaponIndex:index,effect:"wardArmor"}));
      }else{
        choices.push(item("spell-"+index,weapon.name,"✦","magic","attack",
          attacks.includes(index),"施放"+weapon.name+"，消耗1次法术",
          {weaponIndex:index}));
        if(weapon.category==="dark")for(const {effect,name} of effects)
          choices.push(item("status-"+index+"-"+effect,
            name+" · "+weapon.name,"☄","magic","support",
            supported(candidate,effect),"使用"+weapon.name+"施加"+name,
            {weaponIndex:index,effect}));
      }
    }
  }
  // Every owned weapon used to emit the same art again. Preserve the list of
  // distinct skills, and resolve a single eligible weapon slot for each skill.
  // Prefer a legal action over disabled entries, then the currently equipped
  // weapon when equally usable. Never merge genuinely different spells.
  const bySkill=new Map<string,FlatCommand>();
  const semanticKey=(choice:FlatCommand):string=>{
    if(choice.artId)return "art:"+choice.artId;
    if(choice.action==="support"&&choice.effect){
      if(choice.effect==="heal"){
        // Two differently named healing spells remain distinct spells.
        return "heal:"+actor.inventory[choice.weaponIndex!]!+":"+choice.effect;
      }
      // An effect is the same command even when multiple weapons can cast it.
      return "effect:"+choice.effect;
    }
    if(choice.action==="attack"&&choice.group==="magic")
      return "spell:"+actor.inventory[choice.weaponIndex!]!;
    return "command:"+choice.key;
  };
  for(const choice of choices){
    const id=semanticKey(choice),previous=bySkill.get(id);
    const shouldReplace=previous&&(
      (choice.enabled&&!previous.enabled)||
      (choice.enabled===previous.enabled&&
        choice.weaponIndex===actor.equippedIndex&&
        previous.weaponIndex!==actor.equippedIndex));
    if(!previous||shouldReplace)bySkill.set(id,choice);
  }
  const unique=[...bySkill.values()];
  return unique.length?unique:[item("empty-"+group,group==="art"?"暂无可用战技":"暂无可用法术",
    "–",group,"none",false,"可通过战前整备装备武器与技能")];
}

/** Only six stable category headings are ever rendered at the top level. */
export function flatBattleCommands(battle:Battle,actor:Unit):FlatCommand[]{
  const arts=skillSubmenuCommands(battle,actor,"art");
  const spells=skillSubmenuCommands(battle,actor,"magic");
  const canOpen=(xs:FlatCommand[])=>xs.some(x=>x.action!=="none");
  const attack=battle.availableAttackWeapons(actor).includes(actor.equippedIndex)&&
    actor.weapon.kind==="physical";
  const result:FlatCommand[]=[
    item("attack","攻击","⚔","attack","attack",attack,
      attack?"使用当前装备攻击":"当前装备无法攻击；法术请从「法术」选择"),
    item("art","战技","✦","art","submenu",canOpen(arts),
      canOpen(arts)?"查看已装备的通用与职业战技":"当前无可用战技"),
    item("magic","法术","✧","magic","submenu",canOpen(spells),
      canOpen(spells)?"查看所有已持有且符合职业要求的法术":"当前无可用法术"),
    item("inventory","背包","▣","inventory","inventory",true,"查看与切换装备"),
    item("wait","待机","⌛","wait","wait",true,"结束此单位行动"),
  ];
  if(battle.canCancelMove)result.push(item("undo","撤销移动","↶","undo","undo",true,
    "撤回未提交的移动"));
  return result;
}
