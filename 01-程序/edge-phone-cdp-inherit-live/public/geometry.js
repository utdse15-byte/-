'use strict';

(function geometryModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EdgePhoneGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
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

  function relativeDifference(a, b) {
    const left = positive(a, 0);
    const right = positive(b, 0);
    if (!left || !right) return Infinity;
    return Math.abs(left - right) / Math.max(left, right, 1e-9);
  }

  /**
   * Reconstruct Chromium's screencast image inside the phone stage.
   *
   * Page.screencastFrame metadata describes the emulated device in DIP. The
   * encoded JPEG can be downscaled and normally contains only the visible page
   * content; offsetTop tells us where that content begins inside the complete
   * device viewport. Drawing and input share one uniform zoom, so the picture is
   * never stretched independently on X/Y.
   */
  function computeFrameGeometry(options = {}) {
    const containerWidth = positive(options.containerWidth);
    const containerHeight = positive(options.containerHeight);
    const imageWidth = positive(options.imageWidth);
    const imageHeight = positive(options.imageHeight);
    const metadata = options.metadata || {};

    const deviceWidth = positive(metadata.deviceWidth, options.remoteWidth || imageWidth);
    const deviceHeight = positive(metadata.deviceHeight, options.remoteHeight || imageHeight);
    const source = String(metadata.source || 'unknown');
    // Page.startScreencast may return only the page-content image and describes
    // where it starts inside the device viewport with offsetTop. A
    // Page.captureScreenshot frame, however, already represents the complete
    // visual viewport. Reusing a screencast offset for a snapshot shifts the
    // picture and makes identical taps land differently depending on frame
    // source, so non-screencast frames always start at the viewport origin.
    const offsetTop = source.startsWith('screencast') ? finite(metadata.offsetTop, 0) : 0;
    const pageScaleFactor = positive(metadata.pageScaleFactor, 1);
    const visual = metadata.cssVisualViewport && typeof metadata.cssVisualViewport === 'object'
      ? metadata.cssVisualViewport
      : {};
    const layout = metadata.cssLayoutViewport && typeof metadata.cssLayoutViewport === 'object'
      ? metadata.cssLayoutViewport
      : {};
    const cssVisualViewport = {
      offsetX: finite(visual.offsetX, 0),
      offsetY: finite(visual.offsetY, 0),
      pageX: finite(visual.pageX, 0),
      pageY: finite(visual.pageY, 0),
      clientWidth: Math.max(0, finite(visual.clientWidth, 0)),
      clientHeight: Math.max(0, finite(visual.clientHeight, 0)),
      scale: Math.max(0, finite(visual.scale, 0))
    };
    const cssLayoutViewport = {
      pageX: finite(layout.pageX, 0),
      pageY: finite(layout.pageY, 0),
      clientWidth: Math.max(0, finite(layout.clientWidth, 0)),
      clientHeight: Math.max(0, finite(layout.clientHeight, 0))
    };

    // Match Chromium DevTools: fit the complete device viewport, then place the
    // encoded page content at offsetTop. This preserves the metadata coordinate
    // system even when the JPEG does not include the full device height.
    const deviceRatio = deviceHeight / deviceWidth;
    let imageZoom = Math.min(
      containerWidth / imageWidth,
      containerHeight / Math.max(1, imageWidth * deviceRatio)
    );
    if (!Number.isFinite(imageZoom) || imageZoom <= 0) imageZoom = 1;

    const localDevicePixelRatio = finite(options.localDevicePixelRatio, 0);
    if (localDevicePixelRatio > 0) {
      const crispZoom = 1 / localDevicePixelRatio;
      const crispScreenZoom = imageWidth * crispZoom / deviceWidth;
      const crispViewportWidth = deviceWidth * crispScreenZoom;
      const crispViewportHeight = deviceHeight * crispScreenZoom;
      if (imageZoom < crispZoom && crispViewportWidth <= containerWidth + 0.5 && crispViewportHeight <= containerHeight + 0.5) {
        imageZoom = crispZoom;
      }
    }

    const screenZoom = positive(imageWidth * imageZoom / deviceWidth, 1);
    const viewportWidth = deviceWidth * screenZoom;
    const viewportHeight = deviceHeight * screenZoom;
    const originX = (containerWidth - viewportWidth) / 2;
    const originY = (containerHeight - viewportHeight) / 2;
    const drawX = originX;
    const drawY = originY + offsetTop * screenZoom;
    const drawWidth = imageWidth * imageZoom;
    const drawHeight = imageHeight * imageZoom;

    // The encoded image itself is the interactive page-content rectangle. Its
    // actual DIP height is derived from the JPEG aspect ratio, not guessed from
    // deviceHeight-offsetTop (Chromium can reserve additional bottom UI space).
    const contentDipWidth = positive(drawWidth / screenZoom, deviceWidth);
    const contentDipHeight = positive(drawHeight / screenZoom, Math.max(1, deviceHeight - offsetTop));

    return {
      containerWidth,
      containerHeight,
      imageWidth,
      imageHeight,
      localDevicePixelRatio,
      deviceWidth,
      deviceHeight,
      contentDipWidth,
      contentDipHeight,
      offsetTop,
      pageScaleFactor,
      cssVisualViewport,
      cssLayoutViewport,
      nativeScaleX: positive(metadata.nativeScaleX, pageScaleFactor),
      nativeScaleY: positive(metadata.nativeScaleY, pageScaleFactor),
      coordinateScaleSource: String(metadata.coordinateScaleSource || ''),
      targetId: String(metadata.targetId || ''),
      epoch: finite(metadata.epoch, 0),
      viewportRevision: Math.max(0, finite(metadata.viewportRevision, 0)),
      metricsViewportRevision: Math.max(0, finite(metadata.metricsViewportRevision, 0)),
      imageZoom,
      screenZoom,
      viewportWidth,
      viewportHeight,
      originX,
      originY,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
      source,
      sequence: finite(metadata.sequence, 0),
      timestamp: finite(metadata.timestamp, 0),
      scrollOffsetX: finite(metadata.scrollOffsetX, 0),
      scrollOffsetY: finite(metadata.scrollOffsetY, 0)
    };
  }

  /**
   * Calibration is deliberately stored in normalized image space. An offset of
   * 0.01 means 1% of the visible page width/height, so the same correction stays
   * valid after entering fullscreen, rotating the phone, changing DPR, or using
   * a different Edge viewport size.
   */
  function normalizeCalibration(calibration = {}) {
    return {
      version: 66,
      unit: 'normalized',
      offsetX: clamp(finite(calibration.offsetX, 0), -0.12, 0.12),
      offsetY: clamp(finite(calibration.offsetY, 0), -0.12, 0.12),
      scaleX: clamp(finite(calibration.scaleX, 1), 0.85, 1.15),
      scaleY: clamp(finite(calibration.scaleY, 1), 0.85, 1.15)
    };
  }

  function identityCalibration() {
    return normalizeCalibration({});
  }

  /**
   * Map a local phone-stage point to:
   *   1. normalized coordinates inside the *actual painted JPEG*; and
   *   2. legacy DIP coordinates for the DevTools-emulation fallback.
   *
   * Interaction eligibility is based only on whether the finger is over the
   * painted image. A calibration correction is clamped at the remote edge but
   * never turns a valid top/left-edge touch into a dead zone.
   */
  function mapLocalPoint(localX, localY, geometry, calibration = {}) {
    if (!geometry || !Number.isFinite(geometry.drawWidth) || geometry.drawWidth <= 0 ||
        !Number.isFinite(geometry.drawHeight) || geometry.drawHeight <= 0) {
      return {
        x: 0, y: 0, u: 0, v: 0, inside: false,
        rawX: 0, rawY: 0, rawU: 0, rawV: 0, edgeClamped: false
      };
    }

    const x = finite(localX);
    const y = finite(localY);
    const rawU = (x - geometry.drawX) / geometry.drawWidth;
    const rawV = (y - geometry.drawY) / geometry.drawHeight;
    const adjust = normalizeCalibration(calibration);
    const correctedU = 0.5 + (rawU - 0.5) * adjust.scaleX + adjust.offsetX;
    const correctedV = 0.5 + (rawV - 0.5) * adjust.scaleY + adjust.offsetY;
    const u = clamp(correctedU, 0, 1);
    const v = clamp(correctedV, 0, 1);

    // A few CSS pixels of tolerance absorb fractional layout rounding at the
    // exact first/last row without making the surrounding black bars clickable.
    const tolerance = clamp(Math.min(geometry.drawWidth, geometry.drawHeight) * 0.004, 2, 5);
    const inside = x >= geometry.drawX - tolerance && x <= geometry.drawX + geometry.drawWidth + tolerance &&
      y >= geometry.drawY - tolerance && y <= geometry.drawY + geometry.drawHeight + tolerance;

    const contentDipWidth = positive(geometry.contentDipWidth, geometry.deviceWidth);
    const contentDipHeight = positive(geometry.contentDipHeight, Math.max(1, geometry.deviceHeight - geometry.offsetTop));
    return {
      x: u * contentDipWidth,
      y: v * contentDipHeight,
      u,
      v,
      rawX: rawU * contentDipWidth,
      rawY: rawV * contentDipHeight,
      rawU,
      rawV,
      inside,
      edgeClamped: Math.abs(u - correctedU) > 1e-9 || Math.abs(v - correctedV) > 1e-9
    };
  }

  /**
   * Convert an actual CSS viewport point (for example a calibration marker's
   * getBoundingClientRect centre) into the normalized coordinates of the exact
   * painted frame. This deliberately does not divide by visualViewport.width:
   * the screencast may contain a scrollbar or reserved DIP gutter, so the frame
   * itself is the only size-independent reference shared by drawing and input.
   */
  function frameNormalizedToLocal(u, v, geometry) {
    if (!geometry || !Number.isFinite(geometry.drawWidth) || geometry.drawWidth <= 0 ||
        !Number.isFinite(geometry.drawHeight) || geometry.drawHeight <= 0) {
      return { x: 0, y: 0, u: 0, v: 0, valid: false };
    }
    const normalizedU = clamp(finite(u, 0), 0, 1);
    const normalizedV = clamp(finite(v, 0), 0, 1);
    return {
      x: finite(geometry.drawX, 0) + normalizedU * geometry.drawWidth,
      y: finite(geometry.drawY, 0) + normalizedV * geometry.drawHeight,
      u: normalizedU,
      v: normalizedV,
      valid: true
    };
  }

  function cssPointToFrameNormalized(cssX, cssY, geometry) {
    if (!geometry) return { u: 0, v: 0, valid: false };
    const pageScaleFactor = positive(geometry.pageScaleFactor, 0);
    const contentDipWidth = positive(geometry.contentDipWidth, 0);
    const contentDipHeight = positive(geometry.contentDipHeight, 0);
    if (!pageScaleFactor || !contentDipWidth || !contentDipHeight) {
      return { u: 0, v: 0, valid: false };
    }
    const rawU = finite(cssX, 0) * pageScaleFactor / contentDipWidth;
    const rawV = finite(cssY, 0) * pageScaleFactor / contentDipHeight;
    return {
      u: clamp(rawU, 0, 1),
      v: clamp(rawV, 0, 1),
      rawU,
      rawV,
      valid: Number.isFinite(rawU) && Number.isFinite(rawV)
    };
  }

  function geometrySummary(geometry) {
    if (!geometry) return '暂无画面几何信息';
    return [
      `设备 ${geometry.deviceWidth.toFixed(1)}×${geometry.deviceHeight.toFixed(1)} DIP`,
      `内容 ${geometry.contentDipWidth.toFixed(1)}×${geometry.contentDipHeight.toFixed(1)} DIP`,
      `图像 ${geometry.imageWidth}×${geometry.imageHeight}`,
      `screenZoom ${geometry.screenZoom.toFixed(4)}`,
      `offsetTop ${geometry.offsetTop.toFixed(2)}`,
      `pageScale ${geometry.pageScaleFactor.toFixed(3)}`,
      `CSS 视口 ${geometry.cssVisualViewport.clientWidth.toFixed(1)}×${geometry.cssVisualViewport.clientHeight.toFixed(1)}`,
      `视口修订 #${geometry.viewportRevision || 0}`,
      `来源 ${geometry.source}`,
      `帧 #${geometry.sequence || 0}`
    ].join('；');
  }

  function normalizedSampleValue(sample, normalizedKey, legacyKey, dimension) {
    const direct = finite(sample?.[normalizedKey], NaN);
    if (Number.isFinite(direct)) return direct;
    const legacy = finite(sample?.[legacyKey], NaN);
    const size = positive(dimension, 0);
    return Number.isFinite(legacy) && size > 0 ? legacy / size : NaN;
  }

  function usableSamples(samples, deviceWidth = 0, deviceHeight = 0) {
    return (Array.isArray(samples) ? samples : [])
      .map((sample, index) => ({
        index,
        rawU: normalizedSampleValue(sample, 'rawU', 'rawX', deviceWidth),
        rawV: normalizedSampleValue(sample, 'rawV', 'rawY', deviceHeight),
        targetU: normalizedSampleValue(sample, 'targetU', 'targetX', deviceWidth),
        targetV: normalizedSampleValue(sample, 'targetV', 'targetY', deviceHeight)
      }))
      .filter((sample) => [sample.rawU, sample.rawV, sample.targetU, sample.targetV].every(Number.isFinite));
  }

  function fitLine(samples, rawKey, targetKey) {
    if (samples.length < 2) throw new Error('校准采样点不足');
    const count = samples.length;
    const meanRaw = samples.reduce((sum, item) => sum + item[rawKey], 0) / count;
    const meanTarget = samples.reduce((sum, item) => sum + item[targetKey], 0) / count;
    let numerator = 0;
    let denominator = 0;
    for (const item of samples) {
      const delta = item[rawKey] - meanRaw;
      numerator += delta * (item[targetKey] - meanTarget);
      denominator += delta * delta;
    }
    if (denominator < 1e-9) throw new Error('校准点分布不足，无法计算比例');
    const scale = numerator / denominator;
    const intercept = meanTarget - scale * meanRaw;
    return { scale, intercept };
  }

  function residualsFor(samples, xFit, yFit) {
    return samples.map((sample) => {
      const predictedU = xFit.scale * sample.rawU + xFit.intercept;
      const predictedV = yFit.scale * sample.rawV + yFit.intercept;
      const du = predictedU - sample.targetU;
      const dv = predictedV - sample.targetV;
      return { index: sample.index, du, dv, distance: Math.hypot(du, dv) };
    });
  }

  function rms(values) {
    if (!values.length) return Infinity;
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  }

  function median(values) {
    const sorted = (Array.isArray(values) ? values : [])
      .map((value) => finite(value, NaN))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * Robust translation-only calibration. This is intentionally the default
   * automatic calibration: real phones mainly exhibit a stable hit offset,
   * while fitting scale from delayed screencast samples can overfit a few
   * pixels of decode/layout timing noise and make fullscreen worse. Existing
   * edge scales are preserved; three points contribute independent X/Y offset
   * estimates and the median rejects one obvious mistap.
   */
  function fitOffsetCalibration(samples, currentCalibration = {}, deviceWidth = 0, deviceHeight = 0) {
    const usable = usableSamples(samples, deviceWidth, deviceHeight);
    if (usable.length < 2) throw new Error('快速校准至少需要两个有效采样点');
    const current = normalizeCalibration(currentCalibration);
    const estimates = usable.map((sample) => {
      const baseU = 0.5 + (sample.rawU - 0.5) * current.scaleX;
      const baseV = 0.5 + (sample.rawV - 0.5) * current.scaleY;
      return {
        index: sample.index,
        offsetX: sample.targetU - baseU,
        offsetY: sample.targetV - baseV
      };
    });
    const rawOffsetX = median(estimates.map((item) => item.offsetX));
    const rawOffsetY = median(estimates.map((item) => item.offsetY));
    if (!Number.isFinite(rawOffsetX) || !Number.isFinite(rawOffsetY)) {
      throw new Error('无法从快速校准采样计算命中偏移');
    }
    const calibration = normalizeCalibration({
      offsetX: rawOffsetX,
      offsetY: rawOffsetY,
      scaleX: current.scaleX,
      scaleY: current.scaleY
    });
    const residuals = usable.map((sample) => {
      const predictedU = 0.5 + (sample.rawU - 0.5) * calibration.scaleX + calibration.offsetX;
      const predictedV = 0.5 + (sample.rawV - 0.5) * calibration.scaleY + calibration.offsetY;
      const du = predictedU - sample.targetU;
      const dv = predictedV - sample.targetV;
      return { index: sample.index, du, dv, distance: Math.hypot(du, dv) };
    });
    return {
      calibration,
      rawCalibration: {
        offsetX: rawOffsetX,
        offsetY: rawOffsetY,
        scaleX: current.scaleX,
        scaleY: current.scaleY
      },
      rmsX: rms(residuals.map((item) => item.du)),
      rmsY: rms(residuals.map((item) => item.dv)),
      rms: rms(residuals.map((item) => item.distance)),
      maxResidual: Math.max(...residuals.map((item) => item.distance)),
      residuals,
      outlierIndex: null,
      clamped: Math.abs(calibration.offsetX - rawOffsetX) > 1e-6 || Math.abs(calibration.offsetY - rawOffsetY) > 1e-6
    };
  }

  /**
   * Robust axis-aligned five-point calibration in normalized image space.
   * It can correct a small independent X/Y scale and offset but cannot rotate or
   * skew the page—phone/browser rendering does not legitimately introduce such
   * a transform. With five samples, one clear mistap can be excluded.
   */
  function fitCalibration(samples, deviceWidth = 0, deviceHeight = 0) {
    const usable = usableSamples(samples, deviceWidth, deviceHeight);
    if (usable.length < 4) throw new Error('精确校准至少需要四个有效采样点');

    const candidates = [{ excludedIndex: null, samples: usable }];
    if (usable.length >= 5) {
      for (let index = 0; index < usable.length; index += 1) {
        candidates.push({
          excludedIndex: usable[index].index,
          samples: usable.filter((_, itemIndex) => itemIndex !== index)
        });
      }
    }

    let best = null;
    for (const candidate of candidates) {
      let xFit;
      let yFit;
      try {
        xFit = fitLine(candidate.samples, 'rawU', 'targetU');
        yFit = fitLine(candidate.samples, 'rawV', 'targetV');
      } catch {
        continue;
      }
      const residuals = residualsFor(usable, xFit, yFit);
      const inlierResiduals = candidate.excludedIndex === null
        ? residuals
        : residuals.filter((item) => item.index !== candidate.excludedIndex);
      const inlierRms = rms(inlierResiduals.map((item) => item.distance));
      const maxInlier = Math.max(...inlierResiduals.map((item) => item.distance));
      const excluded = candidate.excludedIndex === null
        ? null
        : residuals.find((item) => item.index === candidate.excludedIndex) || null;
      const score = inlierRms + maxInlier * 0.2 + (excluded ? Math.min(0.04, excluded.distance * 0.06) : 0);
      if (!best || score < best.score) best = { score, xFit, yFit, residuals, inlierRms, maxInlier, excluded };
    }
    if (!best) throw new Error('无法从校准采样点计算坐标变换');

    const clearOutlier = best.excluded && best.excluded.distance > Math.max(0.025, best.inlierRms * 4);
    if (best.excluded && !clearOutlier) {
      const xFit = fitLine(usable, 'rawU', 'targetU');
      const yFit = fitLine(usable, 'rawV', 'targetV');
      const residuals = residualsFor(usable, xFit, yFit);
      best = {
        score: rms(residuals.map((item) => item.distance)),
        xFit,
        yFit,
        residuals,
        inlierRms: rms(residuals.map((item) => item.distance)),
        maxInlier: Math.max(...residuals.map((item) => item.distance)),
        excluded: null
      };
    }

    // target = scale*raw + intercept
    //        = .5 + (raw-.5)*scale + offset
    const rawScaleX = best.xFit.scale;
    const rawScaleY = best.yFit.scale;
    const rawOffsetX = best.xFit.intercept - (1 - rawScaleX) / 2;
    const rawOffsetY = best.yFit.intercept - (1 - rawScaleY) / 2;
    const calibration = normalizeCalibration({
      offsetX: rawOffsetX,
      offsetY: rawOffsetY,
      scaleX: rawScaleX,
      scaleY: rawScaleY
    });
    const clamped = Math.abs(calibration.scaleX - rawScaleX) > 1e-6 ||
      Math.abs(calibration.scaleY - rawScaleY) > 1e-6 ||
      Math.abs(calibration.offsetX - rawOffsetX) > 1e-6 ||
      Math.abs(calibration.offsetY - rawOffsetY) > 1e-6;

    return {
      calibration,
      rawCalibration: {
        offsetX: rawOffsetX,
        offsetY: rawOffsetY,
        scaleX: rawScaleX,
        scaleY: rawScaleY
      },
      rmsX: rms(best.residuals.map((item) => item.du)),
      rmsY: rms(best.residuals.map((item) => item.dv)),
      rms: rms(best.residuals.map((item) => item.distance)),
      maxResidual: Math.max(...best.residuals.map((item) => item.distance)),
      inlierRms: best.inlierRms,
      outlierIndex: best.excluded && clearOutlier ? best.excluded.index : null,
      residuals: best.residuals,
      clamped
    };
  }

  return {
    clamp,
    computeFrameGeometry,
    cssPointToFrameNormalized,
    fitCalibration,
    fitOffsetCalibration,
    frameNormalizedToLocal,
    geometrySummary,
    identityCalibration,
    mapLocalPoint,
    normalizeCalibration,
    relativeDifference
  };
});
