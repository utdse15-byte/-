'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referencedIds = new Set([
  ...app.matchAll(/\$\('([^']+)'\)/g),
  ...app.matchAll(/getElementById\('([^']+)'\)/g)
].map((match) => match[1]));

for (const id of referencedIds) {
  assert.ok(ids.has(id), `app.js 引用了不存在的 HTML id: ${id}`);
}

for (const match of html.matchAll(/data-close="([^"]+)"/g)) {
  assert.ok(ids.has(match[1]), `data-close 指向不存在的遮罩: ${match[1]}`);
}

assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'CSP 设计要求 HTML 不包含内联脚本');
assert.ok(!/<style\b/i.test(html), 'CSP 设计要求 HTML 不包含内联样式块');
assert.ok(/touch-action:\s*none/.test(css), '远程画面区必须拦截本地浏览器触摸手势');
assert.ok(/viewport-fit=cover/.test(html), '应适配 Android/iOS 安全区域');
assert.ok(/interactive-widget=resizes-content/.test(html), '软键盘弹出时页面应重排');

const chromeStart = html.indexOf('<header id="browserChrome">');
const chromeEnd = html.indexOf('</header>', chromeStart);
const stageStart = html.indexOf('<main id="stage"');
const stageEnd = html.indexOf('</main>', stageStart);
const badgesAt = html.indexOf('id="topBadges"');
assert.ok(chromeStart >= 0 && badgesAt > chromeStart && badgesAt < chromeEnd, '状态行必须位于浏览器工具栏内');
assert.ok(!(badgesAt > stageStart && badgesAt < stageEnd), '状态行不能覆盖远程网页画面');
assert.ok(ids.has('screenImageBuffer'), '兼容图像模式必须包含第二个预解码图层');
assert.ok(ids.has('browserHistoryModeButton') && ids.has('browserHistoryList'), '标签面板必须提供全局 Edge 浏览历史');
assert.ok(ids.has('computerSortSelect'), '电脑文件面板必须提供排序选择');
assert.ok(ids.has('syncViewportButton'), '设置中必须提供强制重新适配画面尺寸');
assert.ok(/body\.immersive-fullscreen #browserChrome/.test(css), '沉浸全屏必须隐藏手机控制栏');
assert.ok(/body\.immersive-fullscreen #stage/.test(css), '沉浸全屏必须让远程画面占满可视区域');
assert.ok(!/#topBadges\s*\{[^}]*position:\s*absolute/s.test(css), '状态行不能绝对定位到远程画面上');

console.log(`static-dom.test.js: OK (${ids.size} 个元素 id，${referencedIds.size} 个脚本引用)`);
