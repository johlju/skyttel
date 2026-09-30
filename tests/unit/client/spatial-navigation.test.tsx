import { afterEach, expect, test, vi } from 'vitest';
import {
  cameraGestures,
  pinchZoomDeltaLimit,
  pinchZoomRate,
} from '../../../src/client/spatial-navigation.js';

let dispose = () => {};
afterEach(() => dispose());

function arrange() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const camera = { rotate: vi.fn(), pan: vi.fn(), zoom: vi.fn() };
  const gestures = cameraGestures(canvas, camera);
  dispose = () => {
    gestures.dispose();
    canvas.remove();
  };
  const pinch = (deltaY: number, deltaMode = 0) => {
    camera.zoom.mockClear();
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY, deltaMode, ctrlKey: true, cancelable: true }),
    );
    return camera.zoom.mock.calls[0]?.[0] as number;
  };
  return { camera, pinch };
}

test('trackpad pinch zooms by the pinch rate for each wheel pixel in both directions', () => {
  const { camera, pinch } = arrange();
  expect(pinch(-10)).toBeCloseTo(Math.exp(-10 * pinchZoomRate));
  expect(pinch(10)).toBeCloseTo(Math.exp(10 * pinchZoomRate));
  expect(pinch(-10)).toBeCloseTo(0.905, 3);
  expect(camera.pan).not.toHaveBeenCalled();
});

test('a faster pinch with larger wheel deltas zooms more than a slow pinch', () => {
  const { pinch } = arrange();
  const slow = pinch(-2);
  const fast = pinch(-20);
  expect(fast).toBeLessThan(slow);
  expect(Math.log(fast) / Math.log(slow)).toBeCloseTo(10);
});

test('large Ctrl + mouse-wheel steps stop at the per-event limit', () => {
  const { pinch } = arrange();
  const limit = Math.exp(pinchZoomDeltaLimit * pinchZoomRate);
  expect(pinch(100)).toBeCloseTo(limit);
  expect(pinch(-100)).toBeCloseTo(1 / limit);
  expect(pinch(4, 1)).toBeCloseTo(limit);
  expect(pinch(pinchZoomDeltaLimit - 1)).toBeLessThan(limit);
});
