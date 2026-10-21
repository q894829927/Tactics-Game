/** Flat single-level battle commands.
 * All choices in this model execute immediately (or start target selection).
 * No weapon, combat-art or status submenu is part of the main command flow.
 */
import {Battle,type Unit,type SupportEffect} from "../engine/battle.ts";
import {CAREER_ARTS} from "../engine/careerArts.ts";
import {WEAPON_LIBRARY} from "../engine/weapons.ts";

export type FlatCommand={
 key:string; label:string; icon:string; enabled:boolean;
 hint:string;
 action:"attack"|"art"|"career"|"support"|"career-support"|"inventory"|"wait"|"undo"|"none";
 artId?:string; effect?:SupportEffect; group:"attack"|"art"|"magic"|"inventory"|"wait"|"undo";
};
const supports:readonly {effect:SupportEffect;label:string}[]=[
 {effect:"burn",label:"灼烧"},
 {effect:"slow",label:"缓足"},
 {effect:"weakArmor",label:"弱甲"},
 {effect:"weakMagic",label:"弱咒"},
 {effect:"mark",label:"标记"},
];
export function flatBattleCommands(battle:Battle,actor:Unit):FlatCommand[]{
  const current=actor.equippedIndex;
  const armedAttack=battle.availableAttackWeapons(actor).includes(current);
  const magic=actor.weapon.kind==="magical";
  const commands:FlatCommand[]=[{
    key:"attack",label:"攻击",icon:"⚔",enabled:armedAttack&&!magic,
    hint:magic?"当前装备为法术，请使用「法术」":armedAttack?"选择攻击目标":"当前武器射程内无目标；可通过背包换装",
    action:"attack",group:"attack",
  }];
  const career=battle.currentCareerArt(actor);
  const canCareer=battle.availableCareerWeapons(actor).includes(current);
  if(career&&career.target==="enemy")
    commands.push({
      key:"career-"+career.id,label:"战技 · "+career.name,icon:"◆",
      enabled:canCareer,hint:career.description,
      action:"career",artId:career.id,group:"art",
    });
  const formal=battle.formalArtForWeapon(actor);
  const canFormal=battle.availableFormalArtWeapons(actor).includes(current);
  if(formal&&formal.target==="enemy")
    commands.push({
      key:"formal-"+formal.id,label:"战技 · "+formal.name,icon:"✦",
      enabled:canFormal,hint:formal.description,
      action:"art",artId:formal.id,group:"art",
    });
  if(!magic&&battle.availableArtWeapons(actor).includes(current))
    commands.push({
      key:"basic-power",label:"战技 · 强击",icon:"✧",enabled:true,
      hint:"消耗3点武器耐久，首击伤害+2",
      action:"art",artId:battle.basicArt.id,group:"art",
    });
  if(!commands.some(c=>c.group==="art"))commands.push({
    key:"no-art",label:"战技",icon:"✦",enabled:false,
    hint:"当前未装备可用战技或职业技",action:"none",group:"art",
  });
  if(magic&&actor.weapon.effect!=="heal")
    commands.push({
      key:"spell-attack",label:"法术 · "+actor.weapon.name,icon:"✦",
      enabled:armedAttack,hint:armedAttack?"选择施法目标":"当前射程内没有可攻击目标或法术次数不足",
      action:"attack",group:"magic",
    });
  const canSupport=(effect:SupportEffect)=>battle.units.some(unit=>
    battle.previewSupport(actor,unit,effect)!==null);
  for(const {effect,label} of [
    {effect:"heal" as const,label:actor.weapon.effect==="heal"?actor.weapon.name:"治疗"},
    {effect:"shield" as const,label:"护盾"},
  ]){
    if(actor.weapon.effect!=="heal")continue;
    commands.push({
      key:"support-"+effect,label:"法术 · "+label,icon:"✚",
      enabled:canSupport(effect),
      hint:canSupport(effect)?"选择友方目标":"目标已满血、效果已存在或法术次数不足",
      effect,action:"support",group:"magic",
    });
  }
  if(formal&&formal.target==="ally")
    commands.push({
      key:"formal-"+formal.id,label:"法术 · "+formal.name,icon:"✧",
      enabled:canFormal,hint:formal.description,
      effect:"wardArmor",action:"support",group:"magic",
    });
  if(career&&career.target==="ally")
    commands.push({
      key:"career-"+career.id,label:"法术 · "+career.name,icon:"◆",
      enabled:canCareer,hint:career.description,
      artId:career.id,action:"career-support",group:"magic",
    });
  if(actor.weapon.category==="dark")for(const {effect,label} of supports){
    commands.push({
      key:"status-"+effect,label:"法术 · "+label,icon:"☄",
      enabled:canSupport(effect),
      hint:canSupport(effect)?"选择敌方目标":"目标不在范围内或法术次数不足",
      effect,action:"support",group:"magic",
    });
  }
  if(!commands.some(c=>c.group==="magic"))commands.push({
    key:"no-magic",label:"法术",icon:"✦",enabled:false,
    hint:"当前装备没有可用的法术；可通过背包换装",action:"none",group:"magic",
  });
  commands.push(
    {key:"inventory",label:"背包",icon:"▣",enabled:true,
      hint:"在角色背包中直接换装，不打开第二层指令",action:"inventory",group:"inventory"},
    {key:"wait",label:"待机",icon:"⌛",enabled:true,
      hint:"结束当前单位行动",action:"wait",group:"wait"},
  );
  if(battle.canCancelMove)commands.push({
    key:"undo",label:"撤销移动",icon:"↶",enabled:true,
    hint:"返回本回合移动前的格子，不消耗行动",action:"undo",group:"undo",
  });
  return commands;
}
