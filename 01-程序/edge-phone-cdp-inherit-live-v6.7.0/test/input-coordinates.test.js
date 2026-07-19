'use strict';

const assert = require('assert');
const {
  dipDeltaToCss,
  dipToCssPoint,
  normalizedDeltaToCss,
  normalizedToCssPoint,
  resolveFrameCssViewport,
  resolveNativeScales
} = require('../lib/input-coordinates');

function almost(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

{
  const point = normalizedToCssPoint(0.5, 0.25, {
    deviceWidth: 412,
    deviceHeight: 732,
    contentDipWidth: 412,
    contentDipHeight: 700,
    pageScaleFactor: 1,
    viewportRevision: 4,
    metricsViewportRevision: 4,
    cssVisualViewport: { clientWidth: 412, clientHeight: 700, scale: 1 }
  });
  almost(point.x, 206);
  almost(point.y, 175);
  assert.strictEqual(point.source, 'frame-metadata');
}

{
  // A page without viewport meta has a CSS visual viewport around 980px wide,
  // even though the screencast is only 412 DIP wide. The exact frame scale is
  // the inverse transform used by Chromium's ScreencastView.
  const scale = 412 / 980;
  const point = normalizedToCssPoint(0.5, 0.5, {
    deviceWidth: 412,
    deviceHeight: 732,
    contentDipWidth: 412,
    contentDipHeight: 700,
    pageScaleFactor: scale,
    viewportRevision: 9,
    metricsViewportRevision: 9,
    cssVisualViewport: { clientWidth: 980, clientHeight: 1665, scale }
  });
  almost(point.x, 490);
  almost(point.y, 700 / scale / 2);
}

{
  // Even same-revision layout metrics can be sampled during a browser/fullscreen
  // transition. The exact JPEG's pageScaleFactor and content DIP range win.
  const resolved = resolveFrameCssViewport({
    contentDipWidth: 430,
    contentDipHeight: 850,
    pageScaleFactor: 0.5,
    viewportRevision: 12,
    metricsViewportRevision: 12,
    cssVisualViewport: { clientWidth: 390, clientHeight: 620, scale: 1 }
  });
  almost(resolved.cssWidth, 860);
  almost(resolved.cssHeight, 1700);
  assert.strictEqual(resolved.source, 'frame-metadata');
}

{
  // If frame scale is unavailable, layout metrics remain a compatibility
  // fallback for old clients.
  const resolved = resolveFrameCssViewport({
    contentDipWidth: 430,
    contentDipHeight: 850,
    pageScaleFactor: 0,
    cssVisualViewport: { clientWidth: 390, clientHeight: 620, scale: 0 }
  });
  almost(resolved.cssWidth, 390);
  almost(resolved.cssHeight, 620);
  assert.strictEqual(resolved.source, 'visual-viewport-fallback');
}

{
  // X and Y use the actual encoded content DIP range independently; the image
  // can exclude Chromium-reserved top/bottom space.
  const point = normalizedToCssPoint(0.25, 0.75, {
    contentDipWidth: 400,
    contentDipHeight: 720,
    pageScaleFactor: 0.8,
    viewportRevision: 2,
    metricsViewportRevision: 2,
    cssVisualViewport: { clientWidth: 500, clientHeight: 900, scale: 0.8 }
  });
  almost(point.x, 125);
  almost(point.y, 675);
}

{
  const delta = normalizedDeltaToCss(0.1, -0.2, {
    contentDipWidth: 412,
    contentDipHeight: 700,
    pageScaleFactor: 0.42,
    viewportRevision: 3,
    metricsViewportRevision: 3,
    cssVisualViewport: { clientWidth: 980, clientHeight: 1600, scale: 0.42 }
  });
  almost(delta.deltaX, 412 / 0.42 * 0.1);
  almost(delta.deltaY, 700 / 0.42 * -0.2);
}

{
  // The first and last visible pixel are nudged half a CSS pixel inside the
  // viewport so Chromium hit-testing does not reject the top/left boundary.
  const topLeft = normalizedToCssPoint(0, 0, {
    contentDipWidth: 390,
    contentDipHeight: 700,
    pageScaleFactor: 1
  });
  const bottomRight = normalizedToCssPoint(1, 1, {
    contentDipWidth: 390,
    contentDipHeight: 700,
    pageScaleFactor: 1
  });
  almost(topLeft.x, 0.5);
  almost(topLeft.y, 0.5);
  almost(bottomRight.x, 389.5);
  almost(bottomRight.y, 699.5);
}

{
  // Legacy DevTools-compatible DIP mapping remains available.
  const point = dipToCssPoint(206, 210, {
    pageScaleFactor: 412 / 980,
    deviceWidth: 412,
    deviceHeight: 732,
    contentDipWidth: 412,
    contentDipHeight: 700,
    cssVisualViewport: { clientWidth: 980, clientHeight: 1666.6666667, scale: 412 / 980 }
  });
  almost(point.x, 490, 0.5);
  almost(point.y, 500, 0.6);
}

{
  const scales = resolveNativeScales({
    pageScaleFactor: 1,
    deviceWidth: 390,
    deviceHeight: 700,
    contentDipWidth: 390,
    contentDipHeight: 700,
    cssVisualViewport: { clientWidth: 975, clientHeight: 1750, scale: 0.4 }
  });
  almost(scales.scaleX, 0.4);
  almost(scales.scaleY, 0.4);
  const delta = dipDeltaToCss(0, 40, {
    contentDipWidth: 390,
    contentDipHeight: 700,
    cssVisualViewport: { clientWidth: 975, clientHeight: 1750, scale: 0.4 }
  });
  almost(delta.deltaY, 100);
}

{
  const point = dipToCssPoint(9999, -10, {
    pageScaleFactor: 2,
    contentDipWidth: 400,
    contentDipHeight: 800,
    cssVisualViewport: { clientWidth: 200, clientHeight: 400, scale: 2 }
  });
  assert.strictEqual(point.x, 200);
  assert.strictEqual(point.y, 0);
}

console.log('input-coordinates.test.js: OK');
