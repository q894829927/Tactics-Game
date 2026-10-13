/** Fire Emblem inspired Engage-style formulas, with a separate Three Houses charm stat. */
export const BASIC_KEYS=["strength","defense","magic","resistance","speed","luck","dexterity","charm"] as const;
export const GROWTH_KEYS=["hp",...BASIC_KEYS] as const;
export type BasicKey=typeof BASIC_KEYS[number];
export type GrowthKey=typeof GROWTH_KEYS[number];
export type BasicStats=Record<BasicKey,number>;
export type GrowthRates=Record<GrowthKey,number>;
export type Weapon={
  name:string; kind:"physical"|"magical"; might:number; weight:number;
  hit:number; crit:number; dodge:number; minRange:number; maxRange:number;
};
export type CharacterData={
  stats:BasicStats; growths:GrowthRates; weapon:Weapon;
  build:number; move:number; hp:number; maxHp:number; level:number; exp:number;
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
const BASE:Record<string,{speed:number;luck:number;dex:number;res:number;charm:number;
 build:number;weight:number;might:number;hit:number;name:string;kind:"physical"|"magical";
 growths:GrowthRates}>={
 sword:{speed:9,luck:8,dex:10,res:2,charm:6,build:8,weight:5,might:4,hit:110,name:"长剑",kind:"physical",
  growths:{hp:70,strength:55,defense:35,magic:10,resistance:25,speed:55,luck:45,dexterity:50,charm:35}},
 lancer:{speed:7,luck:7,dex:8,res:2,charm:5,build:10,weight:9,might:4,hit:110,name:"长枪",kind:"physical",
  growths:{hp:80,strength:50,defense:55,magic:10,resistance:25,speed:30,luck:35,dexterity:40,charm:30}},
 archer:{speed:9,luck:7,dex:11,res:3,charm:6,build:7,weight:7,might:4,hit:110,name:"长弓",kind:"physical",
  growths:{hp:55,strength:40,defense:20,magic:15,resistance:25,speed:55,luck:45,dexterity:65,charm:35}},
 mage:{speed:8,luck:8,dex:10,res:6,charm:7,build:5,weight:3,might:4,hit:110,name:"火焰术",kind:"magical",
  growths:{hp:45,strength:10,defense:20,magic:65,resistance:55,speed:50,luck:45,dexterity:45,charm:50}},
 raider:{speed:7,luck:6,dex:7,res:1,charm:3,build:7,weight:7,might:3,hit:110,name:"短斧",kind:"physical",
  growths:{hp:60,strength:45,defense:30,magic:5,resistance:15,speed:40,luck:25,dexterity:30,charm:15}},
 commander:{speed:8,luck:8,dex:10,res:4,charm:11,build:11,weight:8,might:4,hit:110,name:"指挥剑",kind:"physical",
  growths:{hp:75,strength:50,defense:50,magic:20,resistance:35,speed:40,luck:40,dexterity:45,charm:50}},
};
export function createCharacter(role:string,hp:number,attack:number,defense:number,move:number,minRange:number,maxRange:number):CharacterData {
  const b=BASE[role];if(!b)throw Error("Unknown class "+role);
  const weapon:Weapon={name:b.name,kind:b.kind,might:b.might,weight:b.weight,hit:b.hit,crit:0,dodge:0,
   minRange,maxRange};
  const stats:BasicStats={strength:b.kind==="physical"?attack-b.might:1,defense,
    magic:b.kind==="magical"?attack-b.might:1,resistance:b.res,speed:b.speed,
    luck:b.luck,dexterity:b.dex,charm:b.charm};
  return {stats,weapon,growths:{...b.growths},build:b.build,move,
    hp,maxHp:hp,level:role==="commander"?4:1,exp:0};
}
export function deriveCombat(c:CharacterData,terrainDefense=0):CombatStats {
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
export function awardExperience(c:CharacterData,amount:number,rng:()=>number):number {
  if(amount<=0||c.level>=99)return 0;
  c.exp+=Math.floor(amount);
  let levels=0;
  while(c.exp>=100&&c.level<99){
    c.level++;levels++;c.exp-=100;
    for(const f of GROWTH_KEYS){
      if(rng()*100>=clampChance(c.growths[f]))continue;
      if(f==="hp"){c.maxHp++;c.hp++;}
      else c.stats[f]++;
    }
  }
  if(c.level>=99)c.exp=0;
  return levels;
}
