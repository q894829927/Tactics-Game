import Phaser from "phaser";
import { Battle } from "./engine/battle.ts";
import { TacticsScene } from "./scene/TacticsScene.ts";
import "./style.css";

const battle = new Battle();
const scene = new TacticsScene(battle);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 760,
  height: 680,
  backgroundColor: "#0c151e",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene: [scene],
});

const get = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing UI element: " + id);
  return el;
};
const button = (id: string): HTMLButtonElement => get(id) as HTMLButtonElement;
function refresh(): void {
  scene.refresh();
  get("round-display").textContent = battle.result === "playing"
    ? "第 " + battle.round + " 回合 · 我方行动"
    : battle.result === "victory" ? "任务完成" : "任务失败";
  const selected = battle.selected;
  get("selection-name").textContent = selected?.name ?? "尚未选择单位";
  get("selection-stats").textContent = selected
    ? "生命 " + selected.hp + "/" + selected.maxHp +
      " · 攻击 " + selected.attack + " · 防御 " + selected.defense +
      " · 移动力 " + selected.move +
      " · 射程 " + selected.minRange + "–" + selected.maxRange
    : "点击地图上的蓝方单位查看属性。";
  get("selection-hint").textContent = selected
    ? (selected.moved ? "已移动" : "可移动") + " · " +
      (selected.spent ? "已待机" : selected.acted ? "已攻击" : "可攻击或待机")
    : "友军：" + battle.alive("ally").length + " / 敌军：" + battle.alive("enemy").length;
  button("wait-button").disabled = !selected || selected.spent || battle.result !== "playing";
  button("end-button").disabled = battle.result !== "playing";
  const result = get("result-banner");
  result.hidden = battle.result === "playing";
  result.textContent = battle.result === "victory"
    ? "胜利！赤旗统领被击败。"
    : battle.result === "defeat" ? "战败。全体友军倒下。" : "";
  const logs = get("log-list");
  logs.replaceChildren();
  for (const line of [...battle.log].reverse()) {
    const item = document.createElement("li");
    item.textContent = line;
    logs.appendChild(item);
  }
}
battle.onChange = refresh;
button("wait-button").addEventListener("click", () => battle.waitSelected());
button("end-button").addEventListener("click", () => battle.endTurn());
button("restart-button").addEventListener("click", () => battle.restart());
refresh();
