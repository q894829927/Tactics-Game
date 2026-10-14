# 分层地图运行时素材

v0.1.20.9 补充素材原图及最终提示词见 [地图补充素材](../../../../../art/map-expansion/v1/README.md)：`tree-broadleaf.*.webp`（384 px）、`shrub.*.webp`（256 px）、`stones.*.webp`（256 px）、`grassy-knoll.*.webp`（384 px），均保留真实 RGBA。阔叶树用于森林变体，灌木和小石用于林缘装饰，丘陵对应实际可走格。十一张素材总量仍不超过 1 MiB，准确字节数以清单为准；下面七张素材的说明保留为原有资源记录。

v0.1.9.0 土地/草地原图与最终提示词见 [地面素材组](../../../../../art/ground-materials/v0.1.9.0/README.md)；树木原图保留在 `art/map-style-samples/v1/`，提示词见 [prompts.json](../../../../../art/map-style-samples/v1/prompts.json)；岩团/水面原图及提示词见 [制作记录](../../../../../art/terrain-readability/v0.1.5.2/README.md)。均由内置 image_gen 原创生成。运行时采用按显示尺寸压缩的 WebP，具体内容哈希文件名、来源、尺寸、字节数及编码参数见 [manifest.json](manifest.json)。

| 文件 | 来源 | 分辨率 | Alpha | 接入 |
| --- | --- | --- | --- | --- |
| ground-earth-a.*.webp / ground-earth-b.*.webp | earth-a.png / earth-b.png | 各 512×512 | 无 | 土地材质变体，移动消耗 1 |
| ground-grass-a.*.webp / ground-grass-b.*.webp | grass-a.png / grass-b.png | 各 512×512 | 无 | 草地材质变体，移动消耗 2；蒙版拼接自然边缘 |
| tree-spruce.*.webp | tree-style-v1.png | 768×768 | 真实 RGBA | 独立森林/外围树木 |
| rock-outcrop.*.webp | rock-outcrop.png | 768×384 | 真实 RGBA | 相邻阻挡格合并为独立天然岩团 |
| river-water.*.webp | river-water.png | 512×512 | 无 | 裁剪到装饰河道内的羽化水面材质 |

v0.1.9.0 技术状态为 `integrated`，最终美术评审仍待确认。七张合计 854,200 字节（约 0.85 MB），低于原来四张合计的 874,588 字节；树木/岩团的透明度与缩放后的源图逐像素一致。旧单一草土地表和横向岩壁均退出运行时，原始样张保留。

`scripts/optimize-map-art.py`（Pillow）可重新导出资源与 `src/scene/mapAssetFiles.ts`。共享加载器使用带内容哈希的路径与 `fetch(..., {cache: "force-cache"})`，主地图和小地图复用同一 Blob URL；浏览器可跨访问使用已缓存的响应。缓存可能被浏览器清理，首次访问仍需下载；ECS 的 HTTP 缓存响应头未修改。

渲染位置由地图数据决定，文件不包含固定关卡布局、角色或 UI。旧 AI 整图已退出运行时。资源缺失时保留程序地表和战斗点击。
