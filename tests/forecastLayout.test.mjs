import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const html = read("index.html");
const css = read("src/style.css");
const board = read("src/scene/BoardView.ts");
const main = read("src/main.ts");

test("forecast is a balanced duel overlay without tutorial copy", () => {
  assert.match(html, /id="attack-forecast"/);
  assert.match(html, /class="forecast-duel"/);
  assert.match(html, /forecast-combatant-ally/);
  assert.match(html, /forecast-combatant-enemy/);
  assert.match(html, /id="forecast-ally-hp"/);
  assert.match(html, /id="forecast-enemy-hp"/);
  assert.match(html, /id="forecast-damage"/);
  assert.match(html, /id="forecast-counter"/);
  assert.match(html, /id="forecast-ally-bar"/);
  assert.match(html, /id="forecast-enemy-after"/);
  assert.doesNotMatch(html, /确认后才会结算|预计伤害|反击伤害|无法反击/);
  assert.match(css, /\.forecast-duel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(140px, 220px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.forecast-health \{/);
});

test("predicted HP bars are proportional and forecast remains non-mutating", () => {
  const game = new Battle();
  const attacker = game.units.find(u => u.id === "a1");
  const target = game.units.find(u => u.id === "e1");
  attacker.x = 5; attacker.y = 1; target.x = 6; target.y = 1;
  game.click(5,1);
  const hpBefore = [attacker.hp,target.hp];
  const forecast = game.forecastAttack(attacker,target);
  assert.deepEqual([attacker.hp,target.hp],hpBefore);
  assert.ok(forecast && forecast.damage >= 0);
  assert.match(board, /combatPreviewView\(attacker, defender, forecast\)/);
  assert.match(board, /\["forecast-ally-after", view\.ally\.hpAfter \/ view\.ally\.unit\.maxHp\]/);
  assert.match(board, /byId\(id\)\.style\.width = Math\.max/);
  assert.match(board, /view\.enemy\.hpAfter \/ view\.enemy\.unit\.maxHp/);
  assert.match(board, /this\.battle\.click\(target\.x,\s*target\.y\)/);
  assert.match(html, /id="forecast-cancel"/);
  assert.match(html, /id="forecast-confirm"/);
});

test("minimap occupies top-right only and the old top-right control is removed", () => {
  const minimapStart=html.indexOf('<div class="minimap"');
  const battlefieldEnd=html.indexOf('<div id="phase-banner"');
  assert.ok(minimapStart>0 && minimapStart < battlefieldEnd);
  assert.doesNotMatch(html, /class="zoom-control"|id="zoom-(in|out|value)"/);
  assert.doesNotMatch(html, /class="minimap-caption"/);
  assert.match(css, /\.minimap \{[\s\S]*?top: 14px;[\s\S]*?right: 14px;[\s\S]*?bottom: auto;[\s\S]*?left: auto;/);
  assert.match(main, /event\.key === "\+"/);
  assert.match(main, /event\.key === "-"/);
  assert.match(board, /viewport\.addEventListener\("wheel"/);
  assert.doesNotMatch(main, /button\("zoom-in"\)|button\("zoom-out"\)|get\("zoom-value"\)/);
});
