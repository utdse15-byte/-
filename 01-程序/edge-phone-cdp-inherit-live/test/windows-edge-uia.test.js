'use strict';

const assert = require('assert');
const {
  chooseTargetFromUia,
  normalizeAddress,
  normalizeTabTitle
} = require('../lib/windows-edge-uia');

const targets = [
  { id: 'a', title: 'ChatGPT - 项目 A', url: 'https://chatgpt.com/c/abc?model=gpt-5', controllable: true },
  { id: 'b', title: 'Claude', url: 'https://claude.ai/new', controllable: true },
  { id: 'c', title: 'ChatGPT - 项目 B', url: 'https://chatgpt.com/c/def', controllable: true },
  { id: 'd', title: 'Claude', url: 'https://claude.ai/chat/123', controllable: true }
];

assert.strictEqual(normalizeAddress('https://www.ChatGPT.com/'), 'chatgpt.com');
assert.strictEqual(normalizeAddress('claude.ai/new/'), 'claude.ai/new');
assert.strictEqual(normalizeTabTitle('(2) Claude - Microsoft Edge'), 'claude');

// 地址栏省略协议的 host:port 地址不能被误解析成自定义协议（曾导致
// localhost:3000 这类内网/开发地址的标签跟随完全失效）。
assert.strictEqual(normalizeAddress('localhost:3000/admin/panel'), 'localhost:3000/admin/panel');
assert.strictEqual(normalizeAddress('http://localhost:3000/admin/panel'), 'localhost:3000/admin/panel');
assert.strictEqual(normalizeAddress('nas:5000/index'), 'nas:5000/index');
// 不透明协议保留前缀：about:blank 不得与主机名恰为 "blank" 的网页相撞。
assert.strictEqual(normalizeAddress('about:blank'), 'about:blank');
assert.notStrictEqual(normalizeAddress('about:blank'), normalizeAddress('https://blank/'));

// 身份非碰撞不变量：语义不同的两个 target 绝不能归一化成同一个身份。
// view-source: 是身份的一部分（CDP 视其为独立 target）。
assert.notStrictEqual(
  normalizeAddress('view-source:https://example.com/a'),
  normalizeAddress('https://example.com/a')
);
// fragment 保留：hash 路由的单页应用靠它区分不同页面。
assert.notStrictEqual(
  normalizeAddress('https://example.com/#/a'),
  normalizeAddress('https://example.com/#/b')
);
// URI 规范只有 scheme 与 host 大小写不敏感：路径/查询保留大小写。
assert.notStrictEqual(
  normalizeAddress('https://example.com/A?q=X'),
  normalizeAddress('https://example.com/a?q=x')
);
// 同时保持既有模糊宽容：host 大小写、www、协议省略、结尾斜杠仍然合并。
assert.strictEqual(normalizeAddress('HTTPS://WWW.Example.COM/a/'), 'example.com/a');
// 地址栏省略 hash 时仍能唯一前缀命中带 hash 路由的页面。
{
  const hashTargets = [
    { id: 'h1', title: '会话', url: 'https://app.example.com/#/conversation/abc', controllable: true },
    { id: 'h2', title: '别的', url: 'https://other.example.com/', controllable: true }
  ];
  const hashMatch = chooseTargetFromUia(hashTargets, {
    edgeForeground: true,
    address: 'app.example.com',
    tabTitle: '完全不同的标题'
  });
  assert.strictEqual(hashMatch?.target?.id, 'h1', '省略 hash 的地址栏文本应能边界前缀命中');
}
{
  const hostPortTargets = [
    { id: 'x', title: 'Admin', url: 'http://localhost:3000/admin/panel', controllable: true },
    { id: 'y', title: 'Example', url: 'https://example.com/', controllable: true }
  ];
  const hostPortMatch = chooseTargetFromUia(hostPortTargets, {
    edgeForeground: true,
    address: 'localhost:3000/admin/panel',
    tabTitle: '完全不同的标题'
  });
  assert.strictEqual(hostPortMatch?.target?.id, 'x', '省略协议的 host:port 地址必须能按 URL 匹配');

  // 用户在地址栏逐字输入时，一两个字符也可能唯一前缀命中某个标签；
  // 不完整地址（过短或不含 . / :）不得触发前缀跟随，必须保持当前标签。
  assert.strictEqual(chooseTargetFromUia(hostPortTargets, {
    edgeForeground: true,
    address: 'l',
    tabTitle: '完全不同的标题'
  }), null, '单字符地址不得前缀匹配');
  assert.strictEqual(chooseTargetFromUia(hostPortTargets, {
    edgeForeground: true,
    address: 'localh',
    tabTitle: '完全不同的标题'
  }), null, '不含 . 或 : 的短输入不得前缀匹配');
  // 前缀必须终止在路径段边界：输入中途的 /adm 不得匹配 /admin/panel。
  assert.strictEqual(chooseTargetFromUia(hostPortTargets, {
    edgeForeground: true,
    address: 'localhost:3000/adm',
    tabTitle: '完全不同的标题'
  }), null, '非边界前缀（输入中途）不得匹配');
  // 地址栏省略查询串是 Edge 的真实行为：边界处的前缀仍可唯一匹配。
  const queryTargets = [
    { id: 'q', title: 'Query', url: 'http://localhost:3000/admin/panel?tab=2', controllable: true },
    { id: 'y2', title: 'Example', url: 'https://example.com/', controllable: true }
  ];
  const boundaryPrefix = chooseTargetFromUia(queryTargets, {
    edgeForeground: true,
    address: 'localhost:3000/admin/panel',
    tabTitle: '完全不同的标题'
  });
  assert.strictEqual(boundaryPrefix?.target?.id, 'q', '省略查询串的完整路径应在边界处唯一匹配');
}

let matched = chooseTargetFromUia(targets, {
  edgeForeground: true,
  address: 'chatgpt.com/c/def',
  tabTitle: 'ChatGPT - 项目 B'
});
assert.strictEqual(matched.target.id, 'c');
assert.strictEqual(matched.confidence, 'url-exact');

matched = chooseTargetFromUia(targets, {
  edgeForeground: true,
  address: 'https://claude.ai/new',
  tabTitle: 'Claude'
});
assert.strictEqual(matched.target.id, 'b');

// Duplicate titles without an address are deliberately ambiguous.
assert.strictEqual(chooseTargetFromUia(targets, {
  edgeForeground: true,
  tabTitle: 'Claude'
}), null);
assert.strictEqual(chooseTargetFromUia(targets, {
  edgeForeground: false,
  address: 'chatgpt.com/c/abc'
}), null);

// 手机专用窗口（WIN-001）：allowedTargetIds 之外的前台标签不得触发跟随，
// 即使地址精确匹配；集合内的标签照常唯一匹配。
assert.strictEqual(chooseTargetFromUia(targets, {
  edgeForeground: true,
  address: 'chatgpt.com/c/def',
  tabTitle: 'ChatGPT - 项目 B'
}, { allowedTargetIds: ['a', 'b'] }), null, '专用窗口之外的标签不得被跟随');

matched = chooseTargetFromUia(targets, {
  edgeForeground: true,
  address: 'chatgpt.com/c/def',
  tabTitle: 'ChatGPT - 项目 B'
}, { allowedTargetIds: ['b', 'c'] });
assert.strictEqual(matched.target.id, 'c', '专用窗口内的标签应正常唯一匹配');

// 空集合等于全部排除：保持当前标签。
assert.strictEqual(chooseTargetFromUia(targets, {
  edgeForeground: true,
  address: 'chatgpt.com/c/def'
}, { allowedTargetIds: [] }), null);

// 作用域过滤不得制造假唯一：专用窗口内外各有一个相同 URL 的标签、真正的
// 前台是主窗口那个时，必须保持当前标签——先在全集内判定身份，再查作用域，
// 不能先删掉集合外证据、再宣布剩下的候选"唯一命中"。
{
  const dupTargets = [
    { id: 'ded', title: '同一页', url: 'https://example.com/shared', controllable: true }, // 专用窗口内
    { id: 'main', title: '同一页', url: 'https://example.com/shared', controllable: true } // 主窗口
  ];
  assert.strictEqual(chooseTargetFromUia(dupTargets, {
    edgeForeground: true,
    address: 'example.com/shared',
    tabTitle: '同一页'
  }, { allowedTargetIds: ['ded'] }), null, '集合内外同 URL 属于歧义，不得切换');
  // 对照：URL 仅存在于专用窗口内时照常唯一匹配。
  const uniqueInside = chooseTargetFromUia([
    { id: 'ded2', title: '独有页', url: 'https://example.com/only-in-dedicated', controllable: true },
    { id: 'main2', title: '别的页', url: 'https://example.com/other', controllable: true }
  ], {
    edgeForeground: true,
    address: 'example.com/only-in-dedicated',
    tabTitle: '独有页'
  }, { allowedTargetIds: ['ded2'] });
  assert.strictEqual(uniqueInside?.target?.id, 'ded2', '仅存在于专用窗口内的 URL 照常跟随');
}

console.log('windows-edge-uia.test.js: OK');
