"use strict";

const { WebSocket } = require("ws");

const endpoint = process.argv[2];
if (!endpoint) {
  console.error("用法: node check-browser-cdp.js ws://127.0.0.1:端口/devtools/browser/...");
  process.exit(1);
}

const ws = new WebSocket(endpoint, { handshakeTimeout: 8000, perMessageDeflate: false });
const timer = setTimeout(() => {
  console.error("浏览器 WebSocket 检查超时。");
  ws.terminate();
  process.exit(1);
}, 10000);

ws.on("open", () => {
  ws.send(JSON.stringify({ id: 1, method: "Target.getTargets", params: {} }));
});
ws.on("message", (raw) => {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return; }
  if (message.id !== 1) return;
  clearTimeout(timer);
  if (message.error) {
    console.error(`Target.getTargets 失败: ${message.error.message || JSON.stringify(message.error)}`);
    process.exitCode = 1;
  } else {
    const pages = (message.result?.targetInfos || []).filter((item) => item.type === "page");
    console.log(`浏览器 WebSocket 连接成功。可控制网页标签页: ${pages.length}`);
    for (const page of pages) console.log(`- ${page.title || "(无标题)"} | ${page.url || ""}`);
  }
  ws.close();
});
ws.on("error", (error) => {
  clearTimeout(timer);
  console.error(`浏览器 WebSocket 连接失败: ${error.message}`);
  process.exitCode = 1;
});
