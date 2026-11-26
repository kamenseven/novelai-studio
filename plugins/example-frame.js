// Example custom feature — delete this file or copy it as a template.
//
// It registers:
//   • a Tools entry  → "加相框卡片" (renders the image into a captioned card)
//   • a Gallery action → "复制 Markdown"
//
// The plugin API is documented in EXTENDING.md.

import { registerPlugin } from '../js/plugins.js';
import { loadImage, canvasToBlob, downloadBlob, sanitizeFilename } from '../js/util.js';
import { toast } from '../js/ui.js';

async function frameCard({ blob, prompt }) {
  const img = await loadImage(URL.createObjectURL(blob));
  const pad = Math.round(Math.min(img.width, img.height) * 0.045) + 14;
  const footer = Math.round(Math.min(img.width, img.height) * 0.16) + 44;
  const w = img.width + pad * 2;
  const h = img.height + pad * 2 + footer;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#141026');
  g.addColorStop(1, '#0a0b10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, pad, pad, img.width, img.height);

  ctx.strokeStyle = 'rgba(167,139,250,0.55)';
  ctx.lineWidth = Math.max(1, Math.round(pad * 0.06));
  ctx.strokeRect(pad / 2, pad / 2, w - pad, h - pad);

  ctx.fillStyle = 'rgba(233,237,246,0.92)';
  const size = Math.max(14, Math.round(w * 0.026));
  ctx.font = `500 ${size}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  const text = (prompt || 'NovelAI Studio').replace(/\s+/g, ' ').trim();
  const maxWidth = w - pad * 2 - 20;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
    if (lines.length >= 2) break;
  }
  if (line && lines.length < 2) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, pad + 6, pad + img.height + size * 1.7 + i * size * 1.35));

  ctx.fillStyle = 'rgba(167,139,250,0.9)';
  ctx.font = `600 ${Math.max(11, Math.round(size * 0.72))}px -apple-system, sans-serif`;
  ctx.fillText('NovelAI Studio', w - pad - ctx.measureText('NovelAI Studio').width - 6, h - pad * 0.55);
  return canvasToBlob(c, 'image/png');
}

registerPlugin({
  id: 'example-frame',
  name: '相框卡片（示例扩展）',
  tools: [
    {
      id: 'frame-card',
      name: '加相框卡片',
      icon: 'image',
      description: '把当前图片放进带提示词的卡片里，演示自定义工具',
      async run(ctx, source) {
        const blob = await frameCard({ blob: source.blob, prompt: source.prompt || ctx.state.prompt });
        return { blob, prompt: source.prompt };
      },
    },
  ],
  resultActions: [
    {
      id: 'copy-markdown',
      name: '复制 Markdown',
      icon: 'copy',
      description: '把图片信息复制为 Markdown',
      async run(ctx, rec) {
        const text = `![${rec.prompt || 'image'}](${rec.id}.png)\n\n- 种子: ${rec.seed ?? '?'}\n- 模型: ${rec.model || '?'}`;
        await navigator.clipboard?.writeText(text);
        toast('Markdown 已复制', 'ok');
      },
    },
  ],
});
