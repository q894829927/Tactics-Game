# 分层地图运行时素材

这三张 PNG 从 `art/map-style-samples/v1/` 原样复制，由内置 image_gen 原创生成；完整提示词见 [prompts.json](../../../../../art/map-style-samples/v1/prompts.json)。

| 文件 | 来源 | 分辨率 | Alpha | 接入 |
| --- | --- | --- | --- | --- |
| ground-grass.png | ground-style-v1.png | 1254×1254 | 无 | 羽化地表材质块 |
| tree-spruce.png | tree-style-v1.png | 1254×1254 | 真实 RGBA | 独立森林/外围树木 |
| cliff-moss.png | cliff-style-v1.png | 1774×887 | 真实 RGBA | 独立峭壁/河岸岩壁 |

v0.1.5.0 技术状态为 `integrated`，最终美术评审仍待确认。渲染位置由地图数据决定，文件不包含固定关卡布局、角色或 UI。旧 AI 整图已退出运行时。资源缺失时保留程序地表和战斗点击。
