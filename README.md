# Tactics-Game · 原创奇幻战棋

独立网页战棋项目，采用 **TypeScript + Vite + 原生 DOM/CSS**。战场采用可缩放、可拖动的地图视口；战斗逻辑独立于渲染层。以《火焰纹章》等经典战棋的回合行动与地形策略为玩法参考，不使用相关官方角色、美术或剧情。

## 开发前必读：版本管理与更新记录

游戏从 **`v0.1.0.0`** 开始使用四段式版本（主版本.特大里程碑.功能.修订），每次完整开发更新都必须**升级版本号并记录具体变更**。下一次小修复使用 `v0.1.0.1`。版本唯一来源为 [`src/version.ts`](src/version.ts)，右下角显示此版本；npm `package.json.version` 保持独立三段格式。

- [更新日志 CHANGELOG.md](CHANGELOG.md)：查看每次更新具体做了什么。
- [版本号规则 docs/VERSIONING.md](docs/VERSIONING.md)：决定升级哪一位，规范提交与 CI。
- [开发代理约束 AGENTS.md](AGENTS.md)：要求每个开发任务同步改版本与日志。


## 目标图四阶段落地计划

根据已确定的战场目标 UI，将视觉与交互落地分为：**A 地图美术重建 → B 角色及右侧状态栏 → C 战斗交互反馈 → D 细节打磨与综合验收**。详细任务、交付物、验收门槛及版本规划见 [docs/VISUAL-IMPLEMENTATION-PLAN.md](docs/VISUAL-IMPLEMENTATION-PLAN.md)。这是待执行计划，不代表这些内容已经完成。**A1 的坐标、12 项资源清单与图层规范已定稿；A2-1 世界舞台/独立命中层已提交（A2-2 已导入原创 AI 森林—石壁—河岸实景母版及小地图，旧 SVG 保留为加载失败回退；浏览器视觉验收尚未完成）**：[查看 A1 设计文档](docs/A1-MAP-ART-SPEC.md)；新增 AI 地图和森林/岩壁/河岸参考裁片位于 [ai 素材目录](public/assets/maps/red-banner/ai)，来源与已知限制见 [AI 场景接入说明](docs/A2-AI-SCENE-INTEGRATION.md)；原有 12 项 SVG 仅作回退。

## 地图素材重构：先研究后实施

[火焰纹章地图组织方式与模块化素材计划](docs/MAP-ASSET-PIPELINE.md)：先做逻辑格独立的微瓦片地表、边缘自动衔接与透明森林/石壁/河岸物件，再组出首块 6×5 地形样片。**仅规划，尚未替换当前 AI 整张底图。**

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
