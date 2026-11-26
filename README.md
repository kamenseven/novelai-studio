# NovelAI Studio

一个复刻 **NovelAI 图像生成全部核心功能** 的静态 Web 应用：纯前端、移动端优先、可直接部署到 GitHub Pages，在手机上像原生 App 一样使用（PWA）。

> 与 NovelAI 官方无关。需要自备 NovelAI 订阅和 **Persistent API Token**。本项目不上传、不代理你的 Token。

![mobile](https://img.shields.io/badge/mobile-PWA-7d5cff) ![static](https://img.shields.io/badge/build-none-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## 功能

**模型**

- V5 Full / V5 Full Medium（14 步蒸馏，更快更省）/ V5 Curated
- V4.5 Full / Curated
- V4 Full / Curated
- Anime V3 / Furry V3
- 自动切换到对应 `-inpainting` 模型做局部重绘，能力矩阵（角色数、Vibe、精准参考、透明背景、SMEAR 等）随模型联动

**文生图**

- 提示词：质量标签（标准/轻量/关闭）、Undesired Content 预设（Heavy/Light/Human/Furry/None）、负面提示词
- NovelAI 提示词语法高亮：`{加强}`、`[减弱]`、`1.5::数值强调::`、`||随机选项||`、`Text:` 文字块
- 实时 Tag 补全：内置 2 万条 Danbooru 标签（分类 + 热度，本地秒出）+ 官方 `suggest-tags` 长尾合并；可打开 Tag 词典浏览/筛选
- 风格模板：前缀 / 后缀 / 风格负面，可限定适用模型系列（V5/V4.5/V4/V3/Furry），可覆盖步数与 CFG，支持导入导出
- 批量矩阵：角色 × 服装 × 动作 × 风格自由组合、任务队列逐张生成、暂停/继续（刷新后续跑）、批次结果聚合
- 提示词片段 `@名称`
- 分辨率：竖/横/方 + 小/标准/大 + 自定义，64 的倍数与 4MP 上限校验
- 步数、Prompt Guidance、采样器、噪声调度、种子（随机/锁定）、张数、CFG Rescale、SMEA/SMEA DYN/Auto SMEA、Dynamic Thresholding
- 多角色提示词：V4/V4.5 最多 6 个 + 5×5 网格定位；V5 最多 32 个 + 自由拖拽定位
- Vibe 迁移：最多 16 张，自动 `/ai/encode-vibe` 编码并缓存（V4+），强度/信息提取、Normaize、`.naiv4vibe` 导入导出
- 精准参考 Precise Reference：角色/风格/两者，强度 + 保真度，参考图自动适配 1024×1536 / 1472×1472 / 1536×1024
- 透明背景（V5，设置 `straight_alpha` + tag hint）
- 流式生成：实时预览采样过程，可取消、可排队（并发 1–2）

**图生图 / 局部重绘**

- 拖拽/上传底图，Strength / Noise
- Inpaint 画布：画笔、撤销、清除、反转、笔刷大小、重绘强度；白=重绘区域的蒙版自动生成
- 底图/蒙版按原图分辨率发送

**后期**

- 放大 4×（V5 独立放大器 `/ai/upscale`）
- 增强 Enhance（img2img 二次生成，可先 4× 放大）
- 导演工具 Director Tools：线稿、草图、上色（可带提示词 + Defry）、表情（Emotion + Defry）、清理、去背景
- 导演工具结果可继续作为下一步输入

**图库**

- IndexedDB 本地保存、缩略图、收藏、搜索（提示词/模型/种子）
- 完整元数据展示；PNG `Comment` 元数据自动解析
- 一键载入设置、复制种子、作为图生图/重绘底图、放大、增强、导演工具、下载
- 服务端返回的 PNG 本身带有 NovelAI 兼容元数据，可直接导入官方站点

**其它**

- 账号面板：Opus 判断、到期时间、Anlas 使用率
- 深/浅主题、响应式桌面布局 + 移动端抽屉、PWA 离线壳
- 插件系统：工具 / 图片操作 / 设置面板 / 提示词变换，见 [EXTENDING.md](EXTENDING.md)

## 快速开始

1. 打开部署好的站点（或本地 `python -m http.server 8137` 后访问 `http://127.0.0.1:8137/`）。
2. 进入「设置」，粘贴 NovelAI Persistent Token（`pst-...`）。Token 只保存在浏览器 `localStorage`，请求直接发往 `https://image.novelai.net`（官方接口已开启 CORS，无需自建代理）。
3. 保存后会自动读取账号信息，回到「生成」开始。

> 在中国大陆访问 `image.novelai.net` 需要代理/VPN；浏览器网络需能直连该域名。

## 部署到 GitHub Pages

仓库本身即站点，无构建步骤。

```bash
git init
git add .
git commit -m "NovelAI Studio"
git branch -M main
git remote add origin https://github.com/<you>/novelai-studio.git
git push -u origin main
```

然后在仓库 **Settings → Pages** 选择 `Deploy from a branch` → `main` → `/ (root)`，保存。

站点地址：`https://<you>.github.io/novelai-studio/`

手机使用：用 Safari/Chrome 打开后「添加到主屏幕」，即可全屏、离线打开壳（API 仍需联网）。

也可以部署到任意静态托管（Vercel/Netlify/Cloudflare Pages/对象存储），不需要服务器。

## 目录结构

```
index.html               入口 + SVG 图标
css/app.css              全部样式（移动优先）
js/
  app.js                 壳、路由、底部导航、账号刷新
  config.js              模型能力矩阵/质量标签/UC 预设/分辨率/采样器
  api.js                 NovelAI API：生成/流式/放大/导演/vibe 编码/账号/补全 + ZIP/PNG 元数据
  payload.js             根据 UI 状态构造官方请求体（params_version 4）
  prompt.js              提示词高亮、随机器、token 估算、Tag 补全定位
  styles.js              风格模板（前缀/后缀/负面/模型限定/参数覆盖）
  tags.js                本地 Danbooru 标签检索
  state.js               状态、持久化、图库/资源 IndexedDB、预设
  actions.js             共享图片操作（下载/载入/放大/增强/导演/收藏）
  ui.js                  通用组件（modal/toast/slider/segmented/viewer）
  plugins.js             插件注册表
  views/                 生成 / 图库 / 批量 / 工具 / 设置
plugins/                 自定义扩展（index.js 引入）
data/tags.json           Danbooru 热度前 2 万标签（本地补全）
sw.js                    PWA 离线壳缓存
manifest.webmanifest
dev/                     开发/测试脚本（不参与部署也可保留）
```

## 实现说明

- 所有请求与官方 Web 端一致：`POST https://image.novelai.net/ai/generate-image`（或 `-stream`）、`/ai/upscale`、`/ai/augment-image`、`/ai/encode-vibe`、`/user/data`、`/ai/generate-image/suggest-tags`。
- 参数使用 `params_version: 4`，包含 `v4_prompt` / `v4_negative_prompt` / `characterPrompts` / `reference_*` / `director_reference_*` 等字段。
- 质量标签与 UC 预设由前端拼接（与官方行为一致），同时发送 `qualityPresetId` / `ucPresetId`。
- 流式响应按 SSE 解析，中途帧用于实时预览。
- 返回 ZIP 由内置解析器解压（store/deflate），PNG `tEXt` 元数据由内置解析器读取，无需第三方库。

## 已知限制

- Vibe 编码、精准参考和非常规分辨率会消耗 Anlas；V5 对 Opus 有免费额度限制（官方策略），界面只做估算提示。
- 图库只在本机浏览器；换设备/清缓存会丢失。重要作品请下载。
- 元数据导入支持 PNG；WebP 的元数据未解析。
- 生成大图/批量时手机可能因内存限制变慢，建议一次 1–2 张。
- 前端直接持有 Token 是静态站点的固有限制；请勿在公共电脑使用，勿把 Token 提交到仓库。

## 扩展

见 [EXTENDING.md](EXTENDING.md)：添加自定义工具、图片操作、设置面板或提示词变换，不需要改构建配置。

## License

MIT
