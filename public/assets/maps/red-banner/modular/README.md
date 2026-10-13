# 分层地图运行时素材

地表/树木原图保留在 `art/map-style-samples/v1/`，提示词见 [prompts.json](../../../../../art/map-style-samples/v1/prompts.json)；v0.1.5.2 新岩团/水面原图及提示词见 [制作记录](../../../../../art/terrain-readability/v0.1.5.2/README.md)。均由内置 image_gen 原创生成。运行时采用按显示尺寸压缩的 WebP，具体内容哈希文件名、来源、尺寸、字节数及编码参数见 [manifest.json](manifest.json)。

| 文件 | 来源 | 分辨率 | Alpha | 接入 |
| --- | --- | --- | --- | --- |
| ground-grass.*.webp | ground-style-v1.png | 1024×1024 | 无 | 羽化地表材质块 |
| tree-spruce.*.webp | tree-style-v1.png | 768×768 | 真实 RGBA | 独立森林/外围树木 |
| rock-outcrop.*.webp | rock-outcrop.png | 768×384 | 真实 RGBA | 相邻阻挡格合并为独立天然岩团 |
| river-water.*.webp | river-water.png | 512×512 | 无 | 裁剪到装饰河道内的羽化水面材质 |

v0.1.5.2 技术状态为 `integrated`，最终美术评审仍待确认。四张合计 874,588 字节（约 0.87 MB），低于上一版三张合计的 897,954 字节；树木/岩团的透明度与缩放后的源图逐像素一致。旧横向岩壁已退出运行时，原始样张保留。

`scripts/optimize-map-art.py`（Pillow）可重新导出资源与 `src/scene/mapAssetFiles.ts`。共享加载器使用带内容哈希的路径与 `fetch(..., {cache: "force-cache"})`，主地图和小地图复用同一 Blob URL；浏览器可跨访问使用已缓存的响应。缓存可能被浏览器清理，首次访问仍需下载；ECS 的 HTTP 缓存响应头未修改。

渲染位置由地图数据决定，文件不包含固定关卡布局、角色或 UI。旧 AI 整图已退出运行时。资源缺失时保留程序地表和战斗点击。
