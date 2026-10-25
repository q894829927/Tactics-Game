import type { Unit, AttackForecast } from "../engine/battle.ts";

/** Both combat directions keep allies on the left and enemies on the right. */
export type SidePreview = {
  unit: Unit;
  hpAfter: number;
  hitText: string;
  /** Existing compact combined text, retained for non-UI callers. */
  damageText: string;
  /** Each strike is intentionally separate: reference shows a follow-up row. */
  firstDamage: number | null;
  followUpDamage: number | null;
};
export type CombatPreviewView = { ally: SidePreview; enemy: SidePreview };

// The forecast HUD only shows combat odds. Weapon/art traits still affect
// engine calculations, but their explanations belong outside this compact row.
const odds = (hit: number, crit: number) =>
  "命中 " + hit + "% · 必杀 " + crit + "%";
const dealt = (damage: number, followUpDamage: number | null) => {
  if(followUpDamage===null)return String(damage);
  return followUpDamage===damage ? damage+"×2" : damage+"＋"+followUpDamage;
};

/** Transposes the attacker's forecast when the enemy is initiating.
 * A missing counterattack remains a dash; never label the enemy as the ally.
 */
export function combatPreviewView(
  attacker: Unit, defender: Unit, forecast: AttackForecast,
): CombatPreviewView {
  if (attacker.team === "ally") {
    return {
      ally: {
        unit: attacker, hpAfter: forecast.attackerHpAfter,
        hitText: odds(forecast.attackerHit, forecast.attackerCrit),
        damageText: dealt(forecast.damage, forecast.followUp === "attacker" ? forecast.followUpDamage : null),
        firstDamage:forecast.damage,
        followUpDamage:forecast.followUp==="attacker"?forecast.followUpDamage:null,
      },
      enemy: {
        unit: defender, hpAfter: forecast.defenderHpAfter,
        hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit) : "无法反击",
        damageText: forecast.canCounter
          ? dealt(forecast.counterDamage, forecast.followUp === "defender" ? forecast.followUpDamage : null) : "—",
        firstDamage:forecast.canCounter?forecast.counterDamage:null,
        followUpDamage:forecast.followUp==="defender"?forecast.followUpDamage:null,
      },
    };
  }
  return {
    ally: {
      unit: defender, hpAfter: forecast.defenderHpAfter,
      hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit) : "无法反击",
      damageText: forecast.canCounter
        ? dealt(forecast.counterDamage, forecast.followUp === "defender" ? forecast.followUpDamage : null) : "—",
      firstDamage:forecast.canCounter?forecast.counterDamage:null,
      followUpDamage:forecast.followUp==="defender"?forecast.followUpDamage:null,
    },
    enemy: {
      unit: attacker, hpAfter: forecast.attackerHpAfter,
      hitText: odds(forecast.attackerHit, forecast.attackerCrit),
      damageText: dealt(forecast.damage, forecast.followUp === "attacker" ? forecast.followUpDamage : null),
      firstDamage:forecast.damage,
      followUpDamage:forecast.followUp==="attacker"?forecast.followUpDamage:null,
    },
  };
}

/** Each potential strike is its own forecast row, in actual execution order.
 * Original HP and projected remaining HP remain outside this list.
 * Zero-damage strikes still keep their odds, because they can miss/crit.
 */
export type ForecastStrikeRow={
  kind:"attack"|"counter"|"follow-up";
  /** Initiating side of this individual strike, not necessarily the player. */
  from:"ally"|"enemy";
  hit:number;crit:number;damage:number;
};
export function forecastStrikeRows(attacker:Unit,forecast:AttackForecast):ForecastStrikeRow[]{
  const first:ForecastStrikeRow={
    kind:"attack",from:attacker.team,hit:forecast.attackerHit,
    crit:forecast.attackerCrit,damage:forecast.damage
  };
  const rows:ForecastStrikeRow[]=[first];
  if(forecast.canCounter){
    rows.push({kind:"counter",from:attacker.team==="ally"?"enemy":"ally",
      hit:forecast.defenderHit,crit:forecast.defenderCrit,damage:forecast.counterDamage});
  }
  if(forecast.followUp){
    rows.push({kind:"follow-up",
      from:forecast.followUp==="attacker"?attacker.team:
        attacker.team==="ally"?"enemy":"ally",
      hit:forecast.followUpHit??(forecast.followUp==="attacker"?forecast.attackerHit:forecast.defenderHit),
      crit:forecast.followUpCrit??(forecast.followUp==="attacker"?forecast.attackerCrit:forecast.defenderCrit),
      damage:forecast.followUpDamage});
  }
  return rows;
}
