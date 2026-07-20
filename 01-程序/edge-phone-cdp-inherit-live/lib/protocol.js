'use strict';

const MAGIC = 'EPC6';
const MAX_HEADER_BYTES = 1024 * 1024;

function makeFramePacket(buffer, metadata) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  // 与 parseFramePacket 保持同一不变式：不存在"只有头没有图像"的合法帧。
  // 编码端造得出来而解码端拒绝的包等于协议自相矛盾。
  if (buffer.length === 0) throw new Error('帧图像数据不能为空');
  const header = Buffer.from(JSON.stringify(metadata || {}), 'utf8');
  if (header.length === 0 || header.length > MAX_HEADER_BYTES) throw new Error('帧元数据大小无效');
  const packet = Buffer.allocUnsafe(8 + header.length + buffer.length);
  packet.write(MAGIC, 0, 4, 'ascii');
  packet.writeUInt32LE(header.length, 4);
  header.copy(packet, 8);
  buffer.copy(packet, 8 + header.length);
  return packet;
}

function parseFramePacket(packet) {
  if (!Buffer.isBuffer(packet)) packet = Buffer.from(packet);
  if (packet.length < 9) throw new Error('帧数据过短');
  if (packet.toString('ascii', 0, 4) !== MAGIC) throw new Error('帧协议标识无效');
  const headerLength = packet.readUInt32LE(4);
  if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES || 8 + headerLength >= packet.length) {
    throw new Error('帧元数据长度无效');
  }
  const metadata = JSON.parse(packet.toString('utf8', 8, 8 + headerLength));
  return {
    metadata,
    image: packet.subarray(8 + headerLength)
  };
}

module.exports = {
  MAGIC,
  MAX_HEADER_BYTES,
  makeFramePacket,
  parseFramePacket
};
