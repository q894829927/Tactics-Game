import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");

test("campaign preparation inspector contains every required live UI mount point",()=>{
  const ids=["campaign-roster","campaign-character-portrait","campaign-character-title",
    "campaign-character-subtitle","campaign-character-progress","campaign-basic-stats",
    "campaign-combat-stats","campaign-equipment","campaign-proficiency",
    "campaign-mastery-count","campaign-masteries","campaign-tab-stats",
    "campaign-tab-growth","campaign-start-sortie","campaign-change-class"];
  for(const id of ids)
    assert.equal(html.split('id="'+id+'"').length,2,"unique mount element "+id);
  assert.match(html,/class="campaign-panel campaign-preparation-panel"/);
  assert.match(html,/id="campaign-preparation-overlay"/);
  assert.match(css,/\.campaign-preparation-body\{/);
});

test("inspector derives character attributes and equipment from battle state",()=>{
  assert.match(main,/effectiveClassStats\(selected\.stats,selected\.classId\)/);
  assert.match(main,/effectiveClassGrowths\(selected\.growths,selected\.classId\)/);
  assert.match(main,/battle\.combatStats\(selected\)/);
  assert.match(main,/weaponResourceText\(selected,index\)/);
  assert.match(main,/battle\.prepareEquipWeapon\(selected\.id,index\)/);
  assert.match(main,/selected\.equippedMasteries/);
  assert.match(main,/classExperienceFor\(selected\.classExperience,selected\.classId\)/);
});
