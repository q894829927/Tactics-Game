# Tactics-Game · 原创奇幻战棋

独立网页战棋项目，采用 **TypeScript + Vite + 原生 DOM/CSS**。战场采用可缩放、可拖动的地图视口；战斗逻辑独立于渲染层。以《火焰纹章》等经典战棋的回合行动与地形策略为玩法参考，不使用相关官方角色、美术或剧情。

## 开发前必读：四段式版本规范

**所有后续开发与发布必须遵守 [`docs/VERSIONING.md`](docs/VERSIONING.md)。** 本项目采用 `v主版本.里程碑.功能.修复` 四段式游戏版本（例如 `v0.0.0.1`）。只有完成并验收特别大的阶段才提升第二段；一般功能提升第三段，小改动提升第四段；普通 Git 提交或 ECS 自动部署无需自动提升游戏版本。`package.json.version` 仍需保持合法的 npm 三段式版本。开发代理还应阅读根目录 [`AGENTS.md`](AGENTS.md)。

## 第一版范围

- 10×8 格子地图；平地、森林、丘陵和障碍。
- 4 名友军 vs 6 名敌军，完整的玩家/敌军回合。
- 可移动区域、近战/远程攻击与反击、地形防御、战斗记录。
- 战斗失败与胜利条件、重新开始；纯前端运行。
- 全屏暗黑奇幻战斗 HUD：左上角设置、右侧全高单位信息、地图缩放与拖拽、小地图定位、单位上下文指令、回合切换动画。
- 目前行动菜单已接通攻击与待机，道具、术法、交换仍未实现并保持禁用态。
- **本版本为最小玩法原型**：不包含剧情、转职、装备、存档、联网或正式场景/人物素材。

## 部署到 ECS（无需本地测试）

已配置 GitHub Actions 云端构建与独立 ECS 发布脚本：**[查看 ECS 一次性安装说明](docs/DEPLOY-ECS.md)**。游戏将通过 `/games/tactics/` 提供，和游戏大厅、异界共振相互独立。首次在 ECS 上运行 `bash scripts/install-ecs.sh` 后，后续 `main` 分支 CI 通过即可由独立 timer 自动上线。

## 可选：本地运行

要求 Node.js 24 LTS。

```bash
npm install
npm run dev
# 浏览器打开 Vite 输出的地址
```

```bash
npm run check
npm run build
npm test
```

玩法和技术验收详见 [设计文档](docs/GAME-DESIGN.md)、[UI 参考图规范](docs/UI-REFERENCE.md) 与 [开发计划](docs/ROADMAP.md)。与 `Rift-Resonance` 和 `Game-Portal` 仓库完全独立；GitHub 构建产物自动生成，ECS 初次安装仍待在服务器运行。
