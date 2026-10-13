import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
test("mobile action menu and picker stay above dock even with tall content",()=>{
  assert.match(board,/private touchDockInset\(\):number \{/);
  assert.match(board,/this\.menu\.offsetHeight \|\|/);
  assert.match(board,/this\.weaponPicker\.offsetHeight \|\|/);
  assert.match(board,/this\.viewport\.clientHeight - menuHeight - this\.touchDockInset\(\)/);
  assert.match(board,/this\.viewport\.clientHeight-height-this\.touchDockInset\(\)/);
  assert.match(css,/\.unit-command-menu \{max-height:calc\(100dvh - 96px\);overflow-y:auto/);
  assert.match(css,/\.weapon-picker \{max-height:calc\(100dvh - 96px\)/);
});
