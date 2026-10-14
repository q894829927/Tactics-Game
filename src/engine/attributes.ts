/** Fire Emblem inspired Engage-style formulas, with a separate Three Houses charm stat. */
export const BASIC_KEYS=["strength","defense","magic","resistance","speed","luck","dexterity","charm"] as const;
export const GROWTH_KEYS=["hp",...BASIC_KEYS] as const;
export type BasicKey=typeof BASIC_KEYS[number];
export type GrowthKey=typeof GROWTH_KEYS[number];
export type BasicStats=Record<BasicKey,number>;
export type GrowthRates=Record<GrowthKey,number>;
import type {Weapon} from "./equipmentTypes.ts";
import type {WeaponExperience} from "./proficiency.ts";

/** Personal character attributes are independent of equipped weapon and class. */
export type CharacterData={
  stats:BasicStats; growths:GrowthRates;
  build:number; move:number; hp:number; maxHp:number; level:number; exp:number;
  weaponExp:WeaponExperience;
};
export type CombatStats={
  physicalAttack:number; magicalAttack:number; physicalProtection:number;
  attackSpeed:number; magicalProtection:number; hit:number; avoid:number;
  crit:number; critAvoid:number; range:string;
};
export const BASIC_LABELS:Record<BasicKey,string>={strength:"力量",defense:"防守",magic:"魔力",
  resistance:"魔防",speed:"速度",luck:"幸运",dexterity:"技巧",charm:"魅力"};
export const GROWTH_LABELS:Record<GrowthKey,string>={hp:"生命值",...BASIC_LABELS};
export const clampChance=(n:number)=>Math.max(0,Math.min(100,Math.floor(n)));
export function deriveCombat(c:CharacterData & {weapon:Weapon},terrainDefense=0):CombatStats {
  const a=c.stats,w=c.weapon;
  const attackSpeed=Math.max(0,a.speed-Math.max(0,w.weight-c.build));
  return {physicalAttack:a.strength+(w.kind==="physical"?w.might:0),
    magicalAttack:a.magic+(w.kind==="magical"?w.might:0),
    physicalProtection:a.defense+terrainDefense,magicalProtection:a.resistance+terrainDefense,
    attackSpeed,hit:Math.max(0,w.hit+a.dexterity*2+Math.floor(a.luck/2)),
    avoid:Math.max(0,attackSpeed*2+Math.floor(a.luck/2)),
    crit:Math.max(0,w.crit+Math.floor(a.dexterity/2)),
    critAvoid:Math.max(0,a.luck+w.dodge),
    range:w.minRange===w.maxRange?String(w.minRange):w.minRange+"–"+w.maxRange};
}
export function awardExperience(c:CharacterData,amount:number,rng:()=>number, growthRates:GrowthRates=c.growths):number {
  if(amount<=0||c.level>=99)return 0;
  c.exp+=Math.floor(amount);
  let levels=0;
  while(c.exp>=100&&c.level<99){
    c.level++;levels++;c.exp-=100;
    for(const f of GROWTH_KEYS){
      if(rng()*100>=clampChance(growthRates[f]))continue;
      if(f==="hp"){c.maxHp++;c.hp++;}
      else c.stats[f]++;
    }
  }
  if(c.level>=99)c.exp=0;
  return levels;
}
