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

const odds = (hit: number, crit: number,trait: string) =>
  "命中 " + hit + "% · 必杀 " + crit + "%" + (trait ? " · " + trait : "");
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
        hitText: odds(forecast.attackerHit, forecast.attackerCrit,forecast.attackerTrait),
        damageText: dealt(forecast.damage, forecast.followUp === "attacker" ? forecast.followUpDamage : null),
        firstDamage:forecast.damage,
        followUpDamage:forecast.followUp==="attacker"?forecast.followUpDamage:null,
      },
      enemy: {
        unit: defender, hpAfter: forecast.defenderHpAfter,
        hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit,forecast.defenderTrait) : "无法反击",
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
      hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit,forecast.defenderTrait) : "无法反击",
      damageText: forecast.canCounter
        ? dealt(forecast.counterDamage, forecast.followUp === "defender" ? forecast.followUpDamage : null) : "—",
      firstDamage:forecast.canCounter?forecast.counterDamage:null,
      followUpDamage:forecast.followUp==="defender"?forecast.followUpDamage:null,
    },
    enemy: {
      unit: attacker, hpAfter: forecast.attackerHpAfter,
      hitText: odds(forecast.attackerHit, forecast.attackerCrit,forecast.attackerTrait),
      damageText: dealt(forecast.damage, forecast.followUp === "attacker" ? forecast.followUpDamage : null),
      firstDamage:forecast.damage,
      followUpDamage:forecast.followUp==="attacker"?forecast.followUpDamage:null,
    },
  };
}
