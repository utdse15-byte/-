'use strict';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 1) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validScale(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.05 && number <= 20;
}

function relativeDifference(a, b) {
  if (!(Number(a) > 0) || !(Number(b) > 0)) return Infinity;
  return Math.abs(Number(a) - Number(b)) / Math.max(Math.abs(Number(a)), Math.abs(Number(b)), 1e-9);
}

function normalizeViewport(value = {}, includeScale = false) {
  const result = {
    offsetX: finite(value.offsetX, 0),
    offsetY: finite(value.offsetY, 0),
    pageX: finite(value.pageX, 0),
    pageY: finite(value.pageY, 0),
    clientWidth: Math.max(0, finite(value.clientWidth, 0)),
    clientHeight: Math.max(0, finite(value.clientHeight, 0))
  };
  if (includeScale) result.scale = Math.max(0, finite(value.scale, 0));
  return result;
}

function normalizeCoordinateContext(context = {}) {
  const deviceWidth = positive(context.deviceWidth, 1);
  const deviceHeight = positive(context.deviceHeight, 1);
  const offsetTop = Math.max(0, finite(context.offsetTop, 0));
  return {
    pageScaleFactor: validScale(context.pageScaleFactor) ? Number(context.pageScaleFactor) : 0,
    deviceWidth,
    deviceHeight,
    contentDipWidth: positive(context.contentDipWidth, deviceWidth),
    contentDipHeight: positive(context.contentDipHeight, Math.max(1, deviceHeight - offsetTop)),
    imageWidth: Math.max(0, finite(context.imageWidth, 0)),
    imageHeight: Math.max(0, finite(context.imageHeight, 0)),
    offsetTop,
    frameSequence: Math.max(0, finite(context.frameSequence ?? context.sequence, 0)),
    frameEpoch: Math.max(0, finite(context.frameEpoch ?? context.epoch, 0)),
    viewportRevision: Math.max(0, finite(context.viewportRevision, 0)),
    metricsViewportRevision: Math.max(0, finite(context.metricsViewportRevision, 0)),
    targetId: String(context.targetId || ''),
    nativeScaleX: validScale(context.nativeScaleX) ? Number(context.nativeScaleX) : 0,
    nativeScaleY: validScale(context.nativeScaleY) ? Number(context.nativeScaleY) : 0,
    cssVisualViewport: normalizeViewport(context.cssVisualViewport, true),
    cssLayoutViewport: normalizeViewport(context.cssLayoutViewport, false)
  };
}

/**
 * Legacy DIP -> CSS conversion used by the DevTools-compatible path and old
 * clients. New native-touch clients send normalized image coordinates instead,
 * which avoids carrying a scale calibrated for one viewport into another.
 */
function resolveNativeScales(rawContext = {}) {
  const context = normalizeCoordinateContext(rawContext);
  const visual = context.cssVisualViewport;
  const layout = context.cssLayoutViewport;
  const contentDipHeight = context.contentDipHeight;

  const widthScale = visual.clientWidth > 0 ? context.contentDipWidth / visual.clientWidth : 0;
  const heightScale = visual.clientHeight > 0 ? contentDipHeight / visual.clientHeight : 0;
  const layoutWidthScale = layout.clientWidth > 0 ? context.contentDipWidth / layout.clientWidth : 0;
  const layoutHeightScale = layout.clientHeight > 0 ? contentDipHeight / layout.clientHeight : 0;
  const visualScale = validScale(visual.scale) ? visual.scale : 0;
  const pageScale = validScale(context.pageScaleFactor) ? context.pageScaleFactor : 0;

  let scaleX = 0;
  let scaleY = 0;
  let source = 'fallback';
  if (validScale(widthScale)) {
    scaleX = widthScale;
    source = 'visual-size';
  } else if (validScale(layoutWidthScale)) {
    scaleX = layoutWidthScale;
    source = 'layout-size';
  } else if (validScale(context.nativeScaleX)) {
    scaleX = context.nativeScaleX;
    source = 'native';
  } else if (visualScale) {
    scaleX = visualScale;
    source = 'visual-scale';
  } else if (pageScale) {
    scaleX = pageScale;
    source = 'page-scale';
  } else {
    scaleX = 1;
  }

  // Use height independently when available. A uniform-width scale was the
  // main reason the old implementation drifted vertically after fullscreen or
  // when Chromium reserved top/bottom screen space.
  if (validScale(heightScale)) scaleY = heightScale;
  else if (validScale(layoutHeightScale)) scaleY = layoutHeightScale;
  else if (validScale(context.nativeScaleY)) scaleY = context.nativeScaleY;
  else scaleY = scaleX;

  if (!validScale(scaleX)) scaleX = 1;
  if (!validScale(scaleY)) scaleY = scaleX;
  const cssWidth = visual.clientWidth > 0
    ? visual.clientWidth
    : layout.clientWidth > 0
      ? layout.clientWidth
      : context.contentDipWidth / scaleX;
  const cssHeight = visual.clientHeight > 0
    ? visual.clientHeight
    : layout.clientHeight > 0
      ? layout.clientHeight
      : context.contentDipHeight / scaleY;

  return {
    scaleX,
    scaleY,
    cssWidth: positive(cssWidth, context.contentDipWidth / scaleX),
    cssHeight: positive(cssHeight, context.contentDipHeight / scaleY),
    source,
    evidence: {
      widthScale,
      heightScale,
      layoutWidthScale,
      layoutHeightScale,
      visualScale,
      pageScale
    },
    context
  };
}

/**
 * Resolve the CSS coordinate range represented by the exact JPEG frame.
 *
 * Chromium's own ScreencastView paints a CSS point with:
 *   imageDIP = css * pageScaleFactor
 * and removes offsetTop before injecting input. Therefore the inverse mapping
 * for native Input.dispatchTouchEvent is determined by the SAME frame's
 * pageScaleFactor and encoded content DIP size. Page.getLayoutMetrics remains
 * useful as a diagnostic/fallback, but it is a separately sampled value and can
 * briefly describe another visual viewport during fullscreen/browser-bar
 * animation. Letting it override the frame was the source of size-dependent
 * horizontal/vertical drift.
 */
function resolveFrameCssViewport(rawContext = {}) {
  const context = normalizeCoordinateContext(rawContext);
  const visual = context.cssVisualViewport;
  const layout = context.cssLayoutViewport;
  const scale = validScale(context.pageScaleFactor) ? context.pageScaleFactor : 0;
  const derivedWidth = scale ? context.contentDipWidth / scale : 0;
  const derivedHeight = scale ? context.contentDipHeight / scale : 0;

  let cssWidth = 0;
  let cssHeight = 0;
  let source = 'frame-metadata';

  if (derivedWidth > 0 && derivedHeight > 0) {
    cssWidth = derivedWidth;
    cssHeight = derivedHeight;
  } else if (visual.clientWidth > 0 && visual.clientHeight > 0) {
    cssWidth = visual.clientWidth;
    cssHeight = visual.clientHeight;
    source = 'visual-viewport-fallback';
  } else if (layout.clientWidth > 0 && layout.clientHeight > 0) {
    cssWidth = layout.clientWidth;
    cssHeight = layout.clientHeight;
    source = 'layout-viewport-fallback';
  } else {
    cssWidth = context.contentDipWidth;
    cssHeight = context.contentDipHeight;
    source = 'identity-fallback';
  }

  return {
    cssWidth: positive(cssWidth, 1),
    cssHeight: positive(cssHeight, 1),
    source,
    context,
    derivedWidth,
    derivedHeight,
    metricsWidth: visual.clientWidth || layout.clientWidth || 0,
    metricsHeight: visual.clientHeight || layout.clientHeight || 0
  };
}

function clampInsideViewport(value, extent) {
  const size = positive(extent, 1);
  // Exact x/y=0 or x/y=extent can sit on Chromium's hit-test boundary. Keep
  // edge touches half a CSS pixel inside so the first/last visible row remains
  // actionable without moving ordinary points.
  const inset = Math.min(0.5, size / 2);
  return clamp(finite(value, 0), inset, Math.max(inset, size - inset));
}

function normalizedToCssPoint(u, v, rawContext = {}) {
  const resolved = resolveFrameCssViewport(rawContext);
  const normalizedU = clamp(finite(u, 0), 0, 1);
  const normalizedV = clamp(finite(v, 0), 0, 1);
  return {
    x: clampInsideViewport(normalizedU * resolved.cssWidth, resolved.cssWidth),
    y: clampInsideViewport(normalizedV * resolved.cssHeight, resolved.cssHeight),
    u: normalizedU,
    v: normalizedV,
    cssWidth: resolved.cssWidth,
    cssHeight: resolved.cssHeight,
    source: resolved.source
  };
}

function normalizedDeltaToCss(deltaU, deltaV, rawContext = {}) {
  const resolved = resolveFrameCssViewport(rawContext);
  return {
    deltaX: finite(deltaU, 0) * resolved.cssWidth,
    deltaY: finite(deltaV, 0) * resolved.cssHeight,
    cssWidth: resolved.cssWidth,
    cssHeight: resolved.cssHeight,
    source: resolved.source
  };
}

function dipToCssPoint(x, y, rawContext = {}) {
  const resolved = resolveNativeScales(rawContext);
  return {
    x: clamp(finite(x, 0) / resolved.scaleX, 0, resolved.cssWidth),
    y: clamp(finite(y, 0) / resolved.scaleY, 0, resolved.cssHeight),
    scaleX: resolved.scaleX,
    scaleY: resolved.scaleY,
    cssWidth: resolved.cssWidth,
    cssHeight: resolved.cssHeight,
    source: resolved.source
  };
}

function dipDeltaToCss(deltaX, deltaY, rawContext = {}) {
  const resolved = resolveNativeScales(rawContext);
  return {
    deltaX: finite(deltaX, 0) / resolved.scaleX,
    deltaY: finite(deltaY, 0) / resolved.scaleY,
    scaleX: resolved.scaleX,
    scaleY: resolved.scaleY
  };
}

module.exports = {
  dipDeltaToCss,
  dipToCssPoint,
  normalizeCoordinateContext,
  normalizedDeltaToCss,
  normalizedToCssPoint,
  resolveFrameCssViewport,
  resolveNativeScales
};
