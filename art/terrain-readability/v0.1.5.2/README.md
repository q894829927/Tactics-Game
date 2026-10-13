# v0.1.5.2 地形辨识度素材

两张原图由内置 `image_gen` 工具生成，已接入分层地图，最终美术仍待用户验收。原始 PNG 非运行时下载资源；`scripts/optimize-map-art.py` 生成内容哈希 WebP，完整尺寸、来源 SHA、Alpha 验证与编码参数见运行时 `manifest.json`。

| 素材 | 原图 | 运行时 | 用途 |
| --- | --- | --- | --- |
| 天然岩团 | rock-outcrop.png，1774×887，RGBA | 768×384，88,564 字节 | 两个相邻不可通行峭壁格组成一个天然岩石障碍 |
| 水面材质 | river-water.png，1254×1254，RGB | 512×512，63,758 字节 | 羽化组装并裁剪到装饰河道内 |

地表、树木继续使用已有素材。四张合计 874,588 字节，比上一版 897,954 字节更小。没有新增完整场景底图，也没有增加河道可走格。

## 岩团最终提示词

```text
Use case: stylized-concept. Asset type: a single transparent terrain obstacle sprite for an original 2D tactical strategy game. Primary request: ONE coherent natural rocky outcrop / low crag occupying a horizontal approximately 2:1 ground footprint, readable as an impassable mass of rock viewed from a high overhead camera (about 65 degrees downward, broad visible top surfaces and a short near-facing rocky face). An irregular compact mound of about 6 large interlocking rugged boulders and a few smaller stones at its base, with restrained forest moss in crevices. Gray weathered granite, muted olive moss, soft upper-left daylight, painterly detailed semi-realistic fantasy strategy-map art that remains readable when rendered at only 180x90 pixels. Composition: centered horizontally, landscape 2:1 image; complete silhouette and a small margin, real transparent alpha around the outcrop and between any isolated small stones. Rounded irregular natural footprint, varied heights, a substantial central rock mass. The rocks sit on the same ground plane, no floating parts. IMPORTANT: do not make a straight stone wall, fence, repeating cliff columns, a cutaway strip, a tile grid, or an artificial architectural structure. No river, no rectangular ground plate, no trees, no broad grassy shelf, no large cast shadow, no text, UI, icons or watermark. The deliverable is an independent terrain prop, not a complete scene or screenshot.
```

## 水面最终提示词

```text
Use case: stylized-concept. Asset type: seamless square water-surface material texture for an original 2D tactical forest map. Primary request: a realistic painterly top-down view of quiet clear blue-green forest river water, nothing but water fills the entire square. Fine irregular ripples and subtle mottled reflected light, restrained gently flowing currents, depth variations in muted desaturated slate-teal and gray-green, sparse soft highlights. Rich natural surface detail similar to hand-painted semi-realistic fantasy strategy map art. Orthographic overhead view, no horizon, no perspective, no shoreline, no rocks, no objects, no fish, no vegetation, no UI or text. Suitable for repeating as a surface material with no conspicuous pattern or hard edges. Avoid cartoon zigzags, stylized wave icons, long white curved strokes, uniform sinusoidal ripples, neon cyan, swimming-pool caustics, photographic harsh reflections and bright patches. Keep luminosity even and low contrast; the river is a background to readable terrain and units. The entire image is an opaque water texture, not a complete landscape.
```

## 接入验证

峭壁两格的阻挡数据保持不变，岩团只覆盖对应格；断开的障碍不能跨越平地合并。河岸、碎石和水面均位于装饰区。测试检查占地、河岸边界、稳定布局、资源字节与哈希、源图对应和 1 MiB 预算。

内置浏览器验证了地表和水面均已载入、88 个景物全部解码、河岸岩壁数为 0、天然岩团占地为 178×88 世界单位，D3/E3 的提示均为“峭壁 · 不可通行”。完整地图见 `desktop.png`，185% 峭壁/河岸细节见 `zoom-185.png` 与 `river-185.png`。这些是实际分层场景截图，没有把生成图当成完整关卡底图。
