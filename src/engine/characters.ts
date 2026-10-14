import type {BasicStats,CharacterData,GrowthRates} from "./attributes.ts";
import type {ClassId} from "./classes.ts";
import type {WeaponId} from "./weapons.ts";
import {emptyWeaponExperience,type WeaponExperience} from "./proficiency.ts";

export type PersonalProfile={
  stats:BasicStats;
  growths:GrowthRates;
  build:number;
};
/** Personal identity, not a class: characters can later change class without
 * swapping their personal growth rates or rebuilding their base attributes.
 */
export const PERSONAL_PROFILES={
  blade:{
    stats:{strength:7,defense:3,magic:1,resistance:2,speed:9,luck:8,dexterity:10,charm:6},
    growths:{hp:70,strength:55,defense:35,magic:10,resistance:25,speed:55,luck:45,dexterity:50,charm:35},
    build:8,
  },
  guard:{
    stats:{strength:6,defense:5,magic:1,resistance:2,speed:7,luck:7,dexterity:8,charm:5},
    growths:{hp:80,strength:50,defense:55,magic:10,resistance:25,speed:30,luck:35,dexterity:40,charm:30},
    build:10,
  },
  marksman:{
    stats:{strength:5,defense:2,magic:1,resistance:3,speed:9,luck:7,dexterity:11,charm:6},
    growths:{hp:55,strength:40,defense:20,magic:15,resistance:25,speed:55,luck:45,dexterity:65,charm:35},
    build:7,
  },
  caster:{
    stats:{strength:1,defense:1,magic:8,resistance:6,speed:8,luck:8,dexterity:10,charm:7},
    growths:{hp:45,strength:10,defense:20,magic:65,resistance:55,speed:50,luck:45,dexterity:45,charm:50},
    build:5,
  },
  marauder:{
    stats:{strength:5,defense:2,magic:1,resistance:1,speed:7,luck:6,dexterity:7,charm:3},
    growths:{hp:60,strength:45,defense:30,magic:5,resistance:15,speed:40,luck:25,dexterity:30,charm:15},
    build:7,
  },
  leader:{
    stats:{strength:7,defense:5,magic:1,resistance:4,speed:8,luck:8,dexterity:10,charm:11},
    growths:{hp:75,strength:50,defense:50,magic:20,resistance:35,speed:40,luck:40,dexterity:45,charm:50},
    build:11,
  },
} as const satisfies Record<string,PersonalProfile>;
export type PersonalProfileId=keyof typeof PERSONAL_PROFILES;

export type CharacterDefinition={
  name:string;
  profileId:PersonalProfileId;
  startingClassId:ClassId;
  startingWeapons:readonly WeaponId[];
  maxHp:number;
  move:number;
  level:number;
  statOverrides?:Partial<BasicStats>;
  /** Explicit starting experience for pre-equipped advanced weapons. */
  startingWeaponExp?:Partial<WeaponExperience>;
};

/** Stable IDs identify people/individual enemies, even if their class changes.
 * F0 preserves every initial weapon, level, stat, growth, and map roster.
 */
export const CHARACTER_LIBRARY={
  a1:{name:"岚锋",profileId:"blade",startingClassId:"sword",
    startingWeapons:["iron-sword","steel-sword","slim-sword"],startingWeaponExp:{sword:120},maxHp:30,move:3,level:1},
  a2:{name:"槿卫",profileId:"guard",startingClassId:"lancer",
    startingWeapons:["iron-lance","steel-lance","javelin"],startingWeaponExp:{lance:120},maxHp:36,move:2,level:1},
  a3:{name:"霜羽",profileId:"marksman",startingClassId:"archer",
    startingWeapons:["iron-bow","steel-bow","long-bow"],startingWeaponExp:{bow:120},maxHp:24,move:3,level:1},
  a4:{name:"星烬",profileId:"caster",startingClassId:"mage",
    startingWeapons:["fire-tome","thunder-tome","wind-tome"],maxHp:23,move:3,level:1},
  e1:{name:"掠夺者 A",profileId:"marauder",startingClassId:"raider",
    startingWeapons:["iron-axe","steel-axe","hand-axe"],startingWeaponExp:{axe:120},maxHp:21,move:3,level:1},
  e2:{name:"长枪兵",profileId:"guard",startingClassId:"lancer",
    startingWeapons:["iron-lance","steel-lance","javelin"],startingWeaponExp:{lance:120},maxHp:26,move:2,level:1,
    statOverrides:{strength:5,defense:4}},
  e3:{name:"弩手",profileId:"marksman",startingClassId:"archer",
    startingWeapons:["iron-bow","steel-bow","long-bow"],startingWeaponExp:{bow:120},maxHp:20,move:2,level:1,
    statOverrides:{strength:4}},
  e4:{name:"掠夺者 B",profileId:"marauder",startingClassId:"raider",
    startingWeapons:["iron-axe","steel-axe","hand-axe"],startingWeaponExp:{axe:120},maxHp:21,move:3,level:1},
  e5:{name:"掠夺者 C",profileId:"marauder",startingClassId:"raider",
    startingWeapons:["iron-axe","steel-axe","hand-axe"],startingWeaponExp:{axe:120},maxHp:21,move:3,level:1},
  e6:{name:"赤旗统领",profileId:"leader",startingClassId:"commander",
    startingWeapons:["command-sword","steel-sword","slim-sword"],startingWeaponExp:{sword:120},maxHp:38,move:2,level:4},
} as const satisfies Record<string,CharacterDefinition>;
export type CharacterId=keyof typeof CHARACTER_LIBRARY;

/** Fresh mutable runtime copy. Never mutate the shared definitions. */
export function createCharacter(characterId:CharacterId):CharacterData {
  const character=CHARACTER_LIBRARY[characterId];
  const profile=PERSONAL_PROFILES[character.profileId];
  const overrides:Partial<BasicStats>="statOverrides" in character
    ? character.statOverrides : {};
  return {
    stats:{...profile.stats,...overrides},
    growths:{...profile.growths},
    build:profile.build,
    move:character.move,
    hp:character.maxHp,
    maxHp:character.maxHp,
    level:character.level,
    exp:0,
    weaponExp:{...emptyWeaponExperience(),...("startingWeaponExp" in character?character.startingWeaponExp:{})},
  };
}
