# 分层地图运行时素材

原图保留在 `art/map-style-samples/v1/`，由内置 image_gen 原创生成；完整提示词见 [prompts.json](../../../../../art/map-style-samples/v1/prompts.json)。运行时采用按显示尺寸压缩的 WebP，具体内容哈希文件名、来源、尺寸、字节数及编码参数见 [manifest.json](manifest.json)。

| 文件 | 来源 | 分辨率 | Alpha | 接入 |
| --- | --- | --- | --- | --- |
| ground-grass.*.webp | ground-style-v1.png | 1024×1024 | 无 | 羽化地表材质块 |
| tree-spruce.*.webp | tree-style-v1.png | 768×768 | 真实 RGBA | 独立森林/外围树木 |
| cliff-moss.*.webp | cliff-style-v1.png | 1024×512 | 真实 RGBA | 独立峭壁/河岸岩壁 |

v0.1.5.1 技术状态为 `integrated`，最终美术评审仍待确认。三张合计 897,954 字节（约 0.90 MB），相比原始 PNG 减少 90.04%；树木/岩壁的透明度与缩放后的源图逐像素一致。

`scripts/optimize-map-art.py`（Pillow）可重新导出资源与 `src/scene/mapAssetFiles.ts`。共享加载器使用带内容哈希的路径与 `fetch(..., {cache: "force-cache"})`，主地图和小地图复用同一 Blob URL；浏览器可跨访问使用已缓存的响应。缓存可能被浏览器清理，首次访问仍需下载；ECS 的 HTTP 缓存响应头未修改。

渲染位置由地图数据决定，文件不包含固定关卡布局、角色或 UI。旧 AI 整图已退出运行时。资源缺失时保留程序地表和战斗点击。
