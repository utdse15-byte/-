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
