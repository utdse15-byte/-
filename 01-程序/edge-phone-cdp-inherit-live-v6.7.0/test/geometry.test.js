'use strict';

const assert = require('assert');
const Geometry = require('../lib/geometry');

function almost(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

{
  const geometry = Geometry.computeFrameGeometry({
    containerWidth: 412,
    containerHeight: 732,
    imageWidth: 824,
    imageHeight: 1400,
    metadata: {
      source: 'screencast',
      deviceWidth: 412,
      deviceHeight: 732,
      offsetTop: 16,
      pageScaleFactor: 1,
      viewportRevision: 7,
      metricsViewportRevision: 7
    }
  });
  almost(geometry.imageZoom, 0.5);
  almost(geometry.screenZoom, 1);
  almost(geometry.originX, 0);
  almost(geometry.originY, 0);
  almost(geometry.drawY, 16);
  almost(geometry.contentDipWidth, 412);
  almost(geometry.contentDipHeight, 700);
  assert.strictEqual(geometry.viewportRevision, 7);
  assert.strictEqual(geometry.metricsViewportRevision, 7);

  const point = Geometry.mapLocalPoint(206, 216, geometry);
  almost(point.u, 0.5);
  almost(point.v, 200 / 700);
  almost(point.x, 206);
  almost(point.y, 200);
  assert.strictEqual(point.inside, true);
}

{
  // captureScreenshot starts at the visual viewport origin. It must never
  // inherit the previous screencast's top gutter.
  const common = {
    containerWidth: 412,
    containerHeight: 732,
    imageWidth: 824,
    imageHeight: 1400,
    metadata: { deviceWidth: 412, deviceHeight: 732, offsetTop: 16 }
  };
  const stream = Geometry.computeFrameGeometry({
    ...common,
    metadata: { ...common.metadata, source: 'screencast' }
  });
  const snapshot = Geometry.computeFrameGeometry({
    ...common,
    metadata: { ...common.metadata, source: 'snapshot' }
  });
  almost(stream.drawY - snapshot.drawY, 16 * stream.screenZoom);
  almost(snapshot.offsetTop, 0);
  almost(snapshot.drawY, snapshot.originY);
}

{
  // A correction that moves the logical point above the first row must clamp
  // to v=0, not turn the visible top row into a dead zone.
  const geometry = Geometry.computeFrameGeometry({
    containerWidth: 390,
    containerHeight: 760,
    imageWidth: 780,
    imageHeight: 1440,
    metadata: { source: 'screencast', deviceWidth: 390, deviceHeight: 760, offsetTop: 20 }
  });
  const point = Geometry.mapLocalPoint(
    geometry.drawX + geometry.drawWidth * 0.25,
    geometry.drawY,
    geometry,
    { offsetX: 0, offsetY: -0.035, scaleX: 1, scaleY: 1 }
  );
  assert.strictEqual(point.inside, true);
  assert.strictEqual(point.edgeClamped, true);
  almost(point.u, 0.25);
  almost(point.v, 0);
}

{
  // Calibration targets must be expressed in the exact frame coordinate system,
  // not as cssX/visualViewport.width. A 15px scrollbar/reserved gutter would
  // otherwise produce a size-dependent horizontal error after fullscreen.
  const geometry = Geometry.computeFrameGeometry({
    containerWidth: 430,
    containerHeight: 850,
    imageWidth: 860,
    imageHeight: 1640,
    metadata: {
      source: 'screencast',
      deviceWidth: 430,
      deviceHeight: 850,
      offsetTop: 10,
      pageScaleFactor: 0.5
    }
  });
  const target = Geometry.cssPointToFrameNormalized(420, 600, geometry);
  assert.strictEqual(target.valid, true);
  almost(target.u, 420 * 0.5 / geometry.contentDipWidth);
  almost(target.v, 600 * 0.5 / geometry.contentDipHeight);
  assert.notStrictEqual(target.u, 420 / 845, '不能按另一次采样的 visualViewport 宽度归一化');
}

{
  // Normalized calibration must produce the same logical point when the phone
  // stage changes size (normal mode -> immersive fullscreen).
  const metadata = { source: 'screencast', deviceWidth: 412, deviceHeight: 732, offsetTop: 12, pageScaleFactor: 1 };
  const normal = Geometry.computeFrameGeometry({
    containerWidth: 390,
    containerHeight: 620,
    imageWidth: 824,
    imageHeight: 1440,
    metadata
  });
  const fullscreen = Geometry.computeFrameGeometry({
    containerWidth: 430,
    containerHeight: 900,
    imageWidth: 824,
    imageHeight: 1440,
    metadata
  });
  const calibration = { offsetX: -0.014, offsetY: 0.009, scaleX: 1.018, scaleY: 0.985 };
  const rawU = 0.72;
  const rawV = 0.31;
  const pointA = Geometry.mapLocalPoint(
    normal.drawX + normal.drawWidth * rawU,
    normal.drawY + normal.drawHeight * rawV,
    normal,
    calibration
  );
  const pointB = Geometry.mapLocalPoint(
    fullscreen.drawX + fullscreen.drawWidth * rawU,
    fullscreen.drawY + fullscreen.drawHeight * rawV,
    fullscreen,
    calibration
  );
  almost(pointA.u, pointB.u);
  almost(pointA.v, pointB.v);
  almost(pointA.u, 0.5 + (rawU - 0.5) * calibration.scaleX + calibration.offsetX);
  almost(pointA.v, 0.5 + (rawV - 0.5) * calibration.scaleY + calibration.offsetY);
}

{
  // Source switches do not change normalized mapping for the same visible
  // content rectangle, even though the screencast is positioned below a gutter.
  const stream = Geometry.computeFrameGeometry({
    containerWidth: 430,
    containerHeight: 900,
    imageWidth: 780,
    imageHeight: 1240,
    metadata: { source: 'screencast', deviceWidth: 390, deviceHeight: 700, offsetTop: 40, pageScaleFactor: 1 }
  });
  const snapshot = Geometry.computeFrameGeometry({
    containerWidth: 430,
    containerHeight: 900,
    imageWidth: 780,
    imageHeight: 1240,
    metadata: { source: 'snapshot-fallback', deviceWidth: 390, deviceHeight: 700, offsetTop: 40, pageScaleFactor: 1 }
  });
  const a = Geometry.mapLocalPoint(stream.drawX + stream.drawWidth * 0.63, stream.drawY + stream.drawHeight * 0.21, stream);
  const b = Geometry.mapLocalPoint(snapshot.drawX + snapshot.drawWidth * 0.63, snapshot.drawY + snapshot.drawHeight * 0.21, snapshot);
  almost(a.u, b.u);
  almost(a.v, b.v);
}

{
  // Geometry used at pointer-down remains authoritative for the whole gesture.
  const downGeometry = Geometry.computeFrameGeometry({
    containerWidth: 400,
    containerHeight: 800,
    imageWidth: 800,
    imageHeight: 1500,
    metadata: { source: 'screencast', deviceWidth: 400, deviceHeight: 800, offsetTop: 20 }
  });
  const laterGeometry = Geometry.computeFrameGeometry({
    containerWidth: 400,
    containerHeight: 800,
    imageWidth: 800,
    imageHeight: 1500,
    metadata: { source: 'screencast', deviceWidth: 400, deviceHeight: 800, offsetTop: 60 }
  });
  const locked = Geometry.mapLocalPoint(200, 220, downGeometry);
  const drifting = Geometry.mapLocalPoint(200, 220, laterGeometry);
  assert.notStrictEqual(locked.v, drifting.v, '手势期间必须锁定 pointerdown 几何');
}

{
  const expected = { offsetX: 0.0175, offsetY: -0.012, scaleX: 1.025, scaleY: 0.975 };
  const rawPoints = [
    [0.18, 0.18],
    [0.82, 0.18],
    [0.18, 0.82],
    [0.82, 0.82]
  ];
  const samples = rawPoints.map(([rawU, rawV]) => ({
    rawU,
    rawV,
    targetU: 0.5 + (rawU - 0.5) * expected.scaleX + expected.offsetX,
    targetV: 0.5 + (rawV - 0.5) * expected.scaleY + expected.offsetY
  }));
  const fitted = Geometry.fitCalibration(samples);
  almost(fitted.calibration.offsetX, expected.offsetX);
  almost(fitted.calibration.offsetY, expected.offsetY);
  almost(fitted.calibration.scaleX, expected.scaleX);
  almost(fitted.calibration.scaleY, expected.scaleY);
  almost(fitted.rms, 0);
  assert.strictEqual(fitted.clamped, false);
}

{
  // v6.6 default quick calibration estimates translation only, preserves the
  // user's edge-scale settings and uses a median so one obvious mistap cannot
  // pull the result away from the other two points.
  const current = { offsetX: 0.01, offsetY: -0.02, scaleX: 0.988, scaleY: 0.991 };
  const expected = { offsetX: -0.043, offsetY: -0.058 };
  const rawPoints = [
    [0.5, 0.28],
    [0.28, 0.68],
    [0.72, 0.68]
  ];
  const samples = rawPoints.map(([rawU, rawV], index) => ({
    rawU,
    rawV,
    targetU: 0.5 + (rawU - 0.5) * current.scaleX + expected.offsetX + (index === 1 ? 0.07 : 0),
    targetV: 0.5 + (rawV - 0.5) * current.scaleY + expected.offsetY + (index === 1 ? -0.08 : 0)
  }));
  const fitted = Geometry.fitOffsetCalibration(samples, current);
  almost(fitted.calibration.offsetX, expected.offsetX);
  almost(fitted.calibration.offsetY, expected.offsetY);
  almost(fitted.calibration.scaleX, current.scaleX);
  almost(fitted.calibration.scaleY, current.scaleY);
  assert.ok(fitted.maxResidual > 0.05, '明显误触应反映在残差中，但不能改变中位数偏移');
}

{
  const expected = { offsetX: -0.019, offsetY: 0.015, scaleX: 1.018, scaleY: 0.982 };
  const rawPoints = [
    [0.16, 0.16],
    [0.84, 0.16],
    [0.16, 0.84],
    [0.84, 0.84],
    [0.5, 0.5]
  ];
  const samples = rawPoints.map(([rawU, rawV], index) => ({
    rawU,
    rawV,
    targetU: 0.5 + (rawU - 0.5) * expected.scaleX + expected.offsetX + (index === 2 ? 0.16 : 0),
    targetV: 0.5 + (rawV - 0.5) * expected.scaleY + expected.offsetY + (index === 2 ? -0.14 : 0)
  }));
  const fitted = Geometry.fitCalibration(samples);
  assert.strictEqual(fitted.outlierIndex, 2, '五点校准应识别一个明显误触点');
  almost(fitted.calibration.offsetX, expected.offsetX, 5e-4);
  almost(fitted.calibration.offsetY, expected.offsetY, 5e-4);
  almost(fitted.calibration.scaleX, expected.scaleX, 5e-4);
  almost(fitted.calibration.scaleY, expected.scaleY, 5e-4);
  assert.ok(fitted.inlierRms < 1e-4, '剔除误触后的有效采样残差应很小');
}

console.log('geometry.test.js: OK');
