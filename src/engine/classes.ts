import type {BasicKey,BasicStats,GrowthKey,GrowthRates} from "./attributes.ts";
import type {WeaponCategory,WeaponRank} from "./equipmentTypes.ts";

export type ClassTier="basic"|"intermediate"|"advanced"|"master"|"legacy";
export type ClassDefinition={
  name:string; emblem:string; portrait:string; tier:ClassTier;
  weaponCategories:readonly WeaponCategory[];
  requiredWeaponRanks:Partial<Record<WeaponCategory,WeaponRank>>;
  statModifiers:Partial<Record<BasicKey,number>>;
  growthModifiers:Partial<Record<GrowthKey,number>>;
  movementMode:"ground"|"cavalry"|"flying";
  unitTags:readonly string[];
  innateAbilityIds:readonly string[];
  masteryRewardIds:readonly string[];
  masteryThreshold:number;
};
/** F0: only the existing class behaviors are active; zero modifiers mean
 * identical current stats. New gauntlet/white classes are dormant metadata.
 * Their certification, proficiency and abilities belong to C1/P1/S1.
 */
export const CLASS_LIBRARY={
  sword:{name:"剑士",emblem:"剑",portrait:"⚔",tier:"basic",
    weaponCategories:["sword"],requiredWeaponRanks:{sword:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:["focus"],masteryRewardIds:["swordFocus"],masteryThreshold:80},
  lancer:{name:"枪卫",emblem:"枪",portrait:"♞",tier:"basic",
    weaponCategories:["lance"],requiredWeaponRanks:{lance:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:["neighborGuard"],masteryRewardIds:["lanceGuard"],masteryThreshold:80},
  archer:{name:"弓手",emblem:"弓",portrait:"➶",tier:"basic",
    weaponCategories:["bow"],requiredWeaponRanks:{bow:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:["aim"],masteryRewardIds:["bowFocus"],masteryThreshold:80},
  mage:{name:"术士",emblem:"术",portrait:"✦",tier:"basic",
    weaponCategories:["dark"],requiredWeaponRanks:{dark:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:["hexSense"],masteryRewardIds:["mageWard"],masteryThreshold:80},
  raider:{name:"步兵",emblem:"兵",portrait:"⚔",tier:"basic",
    weaponCategories:["axe"],requiredWeaponRanks:{axe:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  commander:{name:"指挥官",emblem:"将",portrait:"♜",tier:"basic",
    weaponCategories:["sword"],requiredWeaponRanks:{sword:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  // Future templates, not available in the current battle or player menu.
  brawler:{name:"拳斗士",emblem:"拳",portrait:"✊",tier:"basic",
    weaponCategories:["gauntlet"],requiredWeaponRanks:{gauntlet:"E"},
    statModifiers:{speed:1},growthModifiers:{speed:5},movementMode:"ground",unitTags:[],
    innateAbilityIds:["loneFist"],masteryRewardIds:["brawlerStep"],masteryThreshold:80},
  acolyte:{name:"见习祭司",emblem:"愈",portrait:"✧",tier:"basic",
    weaponCategories:["white"],requiredWeaponRanks:{white:"E"},
    statModifiers:{magic:1},growthModifiers:{magic:5},movementMode:"ground",unitTags:[],
    innateAbilityIds:["firstPrayer"],masteryRewardIds:["acolyteFaith"],masteryThreshold:80},
  axeFighter:{name:"斧斗士",emblem:"斧",portrait:"⚒",tier:"basic",
    weaponCategories:["axe"],requiredWeaponRanks:{axe:"E"},
    statModifiers:{strength:1},growthModifiers:{strength:5},movementMode:"ground",unitTags:[],
    innateAbilityIds:["bravery"],masteryRewardIds:["axePrecision"],masteryThreshold:80},
  duelist:{name:"游剑士",emblem:"剑",portrait:"⚔",tier:"intermediate",
    weaponCategories:["sword"],requiredWeaponRanks:{sword:"D"},
    statModifiers:{speed:2},growthModifiers:{speed:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["nimble"],masteryRewardIds:["duelistTempo"],masteryThreshold:120},
  sentinel:{name:"壁垒卫士",emblem:"盾",portrait:"♜",tier:"intermediate",
    weaponCategories:["lance"],requiredWeaponRanks:{lance:"D"},
    statModifiers:{defense:3},growthModifiers:{defense:10},movementMode:"ground",unitTags:["Armored"],
    innateAbilityIds:["holdGround"],masteryRewardIds:["sentinelGuard"],masteryThreshold:120},
  formationBreaker:{name:"破阵战士",emblem:"阵",portrait:"⚒",tier:"intermediate",
    weaponCategories:["axe"],requiredWeaponRanks:{axe:"D"},
    statModifiers:{strength:3},growthModifiers:{strength:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["breakFormation"],masteryRewardIds:["armorDrill"],masteryThreshold:120},
  eliteMarksman:{name:"精锐射手",emblem:"瞄",portrait:"➶",tier:"intermediate",
    weaponCategories:["bow"],requiredWeaponRanks:{bow:"D"},
    statModifiers:{dexterity:3},growthModifiers:{dexterity:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["stillAim"],masteryRewardIds:["steadyAim"],masteryThreshold:120},
  martialArtist:{name:"斗技家",emblem:"斗",portrait:"✊",tier:"intermediate",
    weaponCategories:["gauntlet"],requiredWeaponRanks:{gauntlet:"D"},
    statModifiers:{speed:3},growthModifiers:{speed:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["counterPose"],masteryRewardIds:["slipFocus"],masteryThreshold:120},
  arcanist:{name:"秘术师",emblem:"秘",portrait:"✦",tier:"intermediate",
    weaponCategories:["dark"],requiredWeaponRanks:{dark:"D"},
    statModifiers:{magic:3},growthModifiers:{magic:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["etching"],masteryRewardIds:["lastingHex"],masteryThreshold:120},
  healer:{name:"祈疗师",emblem:"疗",portrait:"✧",tier:"intermediate",
    weaponCategories:["white"],requiredWeaponRanks:{white:"D"},
    statModifiers:{resistance:2},growthModifiers:{resistance:10},movementMode:"ground",unitTags:[],
    innateAbilityIds:["benevolence"],masteryRewardIds:["healingHeart"],masteryThreshold:120},
  roverCavalry:{name:"游骑兵",emblem:"骑",portrait:"♞",tier:"intermediate",
    weaponCategories:["sword","lance"],requiredWeaponRanks:{sword:"D",lance:"D"},
    statModifiers:{},growthModifiers:{strength:5},movementMode:"cavalry",unitTags:["Cavalry"],
    innateAbilityIds:["charge"],masteryRewardIds:["ridingCharge"],masteryThreshold:120},
  scout:{name:"斥候",emblem:"察",portrait:"➶",tier:"intermediate",
    weaponCategories:["sword","bow"],requiredWeaponRanks:{sword:"D",bow:"E"},
    statModifiers:{speed:1,dexterity:1},growthModifiers:{speed:5,dexterity:5},
    movementMode:"ground",unitTags:[],innateAbilityIds:["forestCover"],
    masteryRewardIds:["forestWalker"],masteryThreshold:120},
  // W1 target-tag fixtures, not selectable characters. C1 adds certification
  // and future movement/pathfinding rules; W1 uses their combat tags only.
  rider:{name:"试验骑兵",emblem:"骑",portrait:"♞",tier:"basic",
    weaponCategories:["lance"],requiredWeaponRanks:{lance:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"cavalry",unitTags:["Cavalry"],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  flier:{name:"试验飞兵",emblem:"翼",portrait:"✦",tier:"basic",
    weaponCategories:["bow"],requiredWeaponRanks:{bow:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"flying",unitTags:["Flying"],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
} as const satisfies Record<string,ClassDefinition>;
export type ClassId=keyof typeof CLASS_LIBRARY;

/** Authoritative class category permission. Equip eligibility also checks P1 XP. */
export function classAllowsWeapon(classId:ClassId,category:WeaponCategory):boolean {
  return CLASS_LIBRARY[classId]?.weaponCategories.some(value=>value===category)??false;
}

/** C1 never writes class modifiers into personal base stats or growths.
 * All these transforms are pure, so repeated switching cannot farm attributes.
 */
export function effectiveClassStats(base:BasicStats,classId:ClassId):BasicStats {
  const modifier=CLASS_LIBRARY[classId].statModifiers as Partial<Record<BasicKey,number>>;
  const stats={...base};
  for(const key of Object.keys(stats) as BasicKey[])
    stats[key]=Math.max(0,base[key]+(modifier[key]??0));
  return stats;
}
export function effectiveClassGrowths(base:GrowthRates,classId:ClassId):GrowthRates {
  const modifier=CLASS_LIBRARY[classId].growthModifiers as Partial<Record<GrowthKey,number>>;
  const rates={...base};
  for(const key of Object.keys(rates) as GrowthKey[])
    rates[key]=Math.max(0,Math.min(100,base[key]+(modifier[key]??0)));
  return rates;
}
