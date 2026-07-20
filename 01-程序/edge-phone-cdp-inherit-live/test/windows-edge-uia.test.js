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

console.log('windows-edge-uia.test.js: OK');
