'use strict';

const assert = require('assert');
const { makeFramePacket, parseFramePacket, MAGIC } = require('../lib/protocol');

const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const metadata = {
  sequence: 42,
  source: 'test',
  offsetTop: -7.5,
  deviceWidth: 412,
  deviceHeight: 732,
  title: '中文帧'
};
const packet = makeFramePacket(image, metadata);
assert.strictEqual(packet.toString('ascii', 0, 4), MAGIC);
const parsed = parseFramePacket(packet);
assert.deepStrictEqual(parsed.metadata, metadata);
assert.deepStrictEqual(parsed.image, image);
assert.throws(() => parseFramePacket(Buffer.from('BAD!')), /过短|协议/);
assert.throws(() => makeFramePacket(Buffer.alloc(1), { value: 'x'.repeat(1024 * 1024) }), /大小/);
// 编码端与解码端共享同一不变式：不存在"只有头没有图像"的合法帧。
assert.throws(() => makeFramePacket(Buffer.alloc(0), { sequence: 1 }), /不能为空/);
console.log('protocol.test.js: OK');
