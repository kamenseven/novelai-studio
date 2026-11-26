# 扩展开发指南（Extending）

NovelAI Studio 的核心是一个静态页面 + 插件注册表。加自定义功能不需要构建工具，也不需要改核心代码。

## 1. 最小示例

新建 `plugins/my-feature.js`：

```js
import { registerPlugin } from '../js/plugins.js';

registerPlugin({
  id: 'my-feature',                     // 唯一 id
  name: '我的扩展',
  tools: [
    {
      id: 'my-tool',
      name: '我的工具',
      icon: 'wand',                     // 见 index.html 中的图标 id
      description: '在输入图片上做点什么',
      async run(ctx, source) {
        // source = { blob, meta, prompt }
        // 返回 Blob 或 { blob, meta?, prompt? }
        return source.blob;
      },
    },
  ],
});
```

然后在 `plugins/index.js` 中 `import './my-feature.js';`，刷新页面生效（Service Worker 会自动更新）。

## 2. 可注册的扩展点

`registerPlugin()` 接受以下字段，全部可选：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填，唯一 |
| `name` | string | 显示名 |
| `tools` | array | 工具页卡片 |
| `resultActions` | array | 图库详情里的图片操作按钮 |
| `settingsPanels` | array | 设置页额外面板（当前版本预留） |
| `promptTransforms` | array<fn> | 发送前修改提示词 |
| `startup` | fn | 页面启动时执行 |

### 工具（tools）

```js
{
  id, name, icon, description,
  async run(ctx, source) { return blob | {blob, meta, prompt} }
}
```

`source`：`{ blob, meta, prompt }`，来自工具页「上传 / 图库 / 当前结果」。

`ctx`：`{ state, addResult, saveToGallery, toast, openViewer, source, utils }`。

### 图片操作（resultActions）

```js
{
  id, name, icon, description,
  async run(ctx, rec) { /* rec.blob, rec.meta, rec.prompt, rec.seed ... */ }
}
```

显示在图库详情底部。

### 提示词变换（promptTransforms）

```js
{
  id, name, description,
  transform(prompt, state) { return prompt2 }
}
```

注意：`promptTransforms` 也可以直接是函数数组（旧式），注册表按函数调用。

### 启动钩子

```js
registerPlugin({ id: 'x', startup() { console.log('ready'); } });
```

## 3. 可用工具函数

```js
import {
  loadImage, canvasToBlob, downloadBlob, blobToDataURL, dataURLToBlob,
  toast, modal, confirmDialog, openViewer, slider, select, switchRow,
  $, el, svg, escapeHTML, downloadResult,
} from '../js/...';
```

- `loadImage(url)` → `Promise<HTMLImageElement>`
- `canvasToBlob(canvas, type, quality)` → `Promise<Blob>`
- `downloadBlob(blob, filename)`
- `toast(message, 'ok'|'error'|'info')`
- `modal({title, body, actions})` → `{ close, body }`
- `downloadResult(rec)` 直接下载带正确文件名的结果

## 4. 典型场景

### 批量提示词矩阵

在工具里读取 `ctx.state.prompt`，替换占位符后逐个调用 API：

```js
import { generateImage } from '../js/api.js';
import { buildRequest } from '../js/payload.js';

const { body } = await buildRequest({ ...ctx.state, prompt: newPrompt });
const imgs = await generateImage({ payload: body, stream: false });
```

### 给图片加水印

```js
const img = await loadImage(URL.createObjectURL(source.blob));
const c = document.createElement('canvas');
c.width = img.width; c.height = img.height;
const g = c.getContext('2d');
g.drawImage(img, 0, 0);
g.fillStyle = 'rgba(255,255,255,.7)';
g.font = `${Math.round(img.width / 30)}px sans-serif`;
g.fillText('© me', 24, img.height - 24);
return canvasToBlob(c, 'image/png');
```

### 调用其它 NovelAI 接口

`js/api.js` 已封装 token、超时、错误信息与 CORS：

```js
import { directorTool, upscaleImage, encodeVibe, getUserData } from '../js/api.js';
```

## 5. 图标

在 `index.html` 的 `<svg class="sprite">` 中添加 `<symbol id="i-你的名字">`，然后 `icon: '你的名字'`（`svg('...')` 也可直接用在组件里）。

## 6. 调试

- 本地：`python -m http.server 8137`，访问 `http://127.0.0.1:8137/`。
- 插件加载失败会在 Console 打印 `No external plugins loaded` 或具体错误；扩展本身的异常会被捕获并 toast。
- 修改后强刷（Ctrl+F5）或 DevTools → Application → Service Workers → Update。

## 7. 注意事项

- 不要把 Token 写进插件或仓库。
- 插件里的网络请求仍受浏览器 CORS 限制；NovelAI 接口允许 `*`，第三方接口需自行处理。
- 大图的 canvas 操作在手机上注意内存（建议不超过 4096×4096）。
- 扩展代码与核心代码同源运行，请只安装你信任的插件。
