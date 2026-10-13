import type { Unit, AttackForecast } from "../engine/battle.ts";

/** Both combat directions keep allies on the left and enemies on the right. */
export type SidePreview = {
  unit: Unit;
  hpAfter: number;
  hitText: string;
  damageText: string;
};
export type CombatPreviewView = { ally: SidePreview; enemy: SidePreview };

const odds = (hit: number, crit: number) => "命中 " + hit + "% · 必杀 " + crit + "%";
const dealt = (damage: number, followUp: boolean) =>
  String(damage) + (followUp ? "×2" : "");

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
        damageText: dealt(forecast.damage, forecast.followUp === "attacker"),
      },
      enemy: {
        unit: defender, hpAfter: forecast.defenderHpAfter,
        hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit) : "无法反击",
        damageText: forecast.canCounter
          ? dealt(forecast.counterDamage, forecast.followUp === "defender") : "—",
      },
    };
  }
  return {
    ally: {
      unit: defender, hpAfter: forecast.defenderHpAfter,
      hitText: forecast.canCounter ? odds(forecast.defenderHit, forecast.defenderCrit) : "无法反击",
      damageText: forecast.canCounter
        ? dealt(forecast.counterDamage, forecast.followUp === "defender") : "—",
    },
    enemy: {
      unit: attacker, hpAfter: forecast.attackerHpAfter,
      hitText: odds(forecast.attackerHit, forecast.attackerCrit),
      damageText: dealt(forecast.damage, forecast.followUp === "attacker"),
    },
  };
}
