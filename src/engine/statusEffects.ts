/** S1-2 temporary battle effects; never written to persistent campaign saves. */
export const STATUS_KINDS=["burn","slow","weakArmor","weakMagic","mark","shield","evasion","wardArmor","meleeWeaken"] as const;
export type StatusKind=typeof STATUS_KINDS[number];
export type StatusInstance={kind:StatusKind;power:number;expiresAfter:number;sourceId:string};
export type StatusOwner={statuses:StatusInstance[];hp:number;maxHp:number};
export const STATUS_LABELS:Record<StatusKind,string>={
  burn:"灼烧",slow:"缓足",weakArmor:"弱甲",weakMagic:"弱咒",mark:"标记",shield:"护盾",evasion:"虚步",wardArmor:"护壁",meleeWeaken:"失衡",
};
export function statusPower(unit:StatusOwner,kind:StatusKind):number{
  return unit.statuses.find(s=>s.kind===kind)?.power??0;
}
export function applyStatus(unit:StatusOwner,kind:StatusKind,expiresAfter:number,
  sourceId:string,power?:number):boolean{
  if(!STATUS_KINDS.includes(kind)||unit.hp<=0||
    !Number.isSafeInteger(expiresAfter)||expiresAfter<1)return false;
  const defaults:Record<StatusKind,number>={burn:2,slow:1,weakArmor:2,weakMagic:2,mark:5,shield:3,evasion:10,wardArmor:2,meleeWeaken:5};
  const amount=kind==="shield"?Math.min(5,power??defaults[kind]):power??defaults[kind];
  if(!Number.isSafeInteger(amount)||amount<=0)return false;
  const old=unit.statuses.find(s=>s.kind===kind);
  if(old){old.power=Math.max(old.power,amount);old.expiresAfter=expiresAfter;old.sourceId=sourceId;}
  else unit.statuses.push({kind,power:amount,expiresAfter,sourceId});
  return true;
}
export function removeStatus(unit:StatusOwner,kind:StatusKind):boolean{
  const i=unit.statuses.findIndex(s=>s.kind===kind);
  if(i<0)return false;
  unit.statuses.splice(i,1);return true;
}
/** On the target's next own phase start, burn ticks once and cannot kill. */
export function startStatusPhase(unit:StatusOwner,serial:number):number{
  const burn=unit.statuses.find(s=>s.kind==="burn"&&s.expiresAfter<=serial);
  if(!burn||unit.hp<=1)return 0;
  const dealt=Math.min(burn.power,unit.hp-1);
  unit.hp-=dealt;return dealt;
}
export function finishStatusPhase(unit:StatusOwner,serial:number):void{
  unit.statuses=unit.statuses.filter(s=>s.expiresAfter>serial);
}
export function absorbDamage(unit:StatusOwner,amount:number):{hpLoss:number;absorbed:number}{
  const shield=unit.statuses.find(s=>s.kind==="shield");
  const absorbed=Math.min(Math.max(0,amount),shield?.power??0);
  if(shield){shield.power-=absorbed;if(shield.power===0)removeStatus(unit,"shield");}
  const hpLoss=Math.min(unit.hp,Math.max(0,amount-absorbed));
  unit.hp=Math.max(0,unit.hp-hpLoss);
  return {hpLoss,absorbed};
}
export function previewDamage(unit:StatusOwner,amount:number):number{
  return Math.min(unit.hp,Math.max(0,amount-statusPower(unit,"shield")));
}
export function statusDescription(unit:StatusOwner):string{
  return unit.statuses.map(s=>STATUS_LABELS[s.kind]+(s.kind==="shield"?" "+s.power:"")+
    "（至第"+s.expiresAfter+"次本方阶段末）").join(" / ");
}
