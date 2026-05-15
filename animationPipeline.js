/**
 * Animation pipeline
 *
 * Called once per render frame with the actual delta time.
 * Smooths every faceState value from .target → .current using
 * frame-rate-independent exponential decay.
 *
 * Half-life tuning guide:
 *   0.04s  → very snappy  (blinks)
 *   0.08s  → responsive   (jaw)
 *   0.12s  → smooth       (head rotation)
 *   0.18s  → heavy        (translation drift)
 */

import { faceState } from './faceState.js';
import { expDecay, expDecayAngle } from './smoothing.js';

export const HALF_LIVES = {
  jawOpen:            0.07,   // snappy enough for speech, not jittery
  blinkLeft:          0.035,  // blinks must close fast
  blinkRight:         0.035,
  headPitch:          0.10,
  headYaw:            0.10,
  headRoll:           0.12,
  headTranslationX:   0.15,   // translation lags slightly behind rotation (parallax feel)
  headTranslationY:   0.15,
};

/**
 * @param {number} dt - Delta time in seconds since last frame
 */
export function updateAnimation(dt) {
  // Guard against crazy dt values on first frame / tab-wake
  const safeDt = Math.min(dt, 0.1);

  // Scalar blendshapes
  faceState.jawOpen.current = expDecay(
    faceState.jawOpen.current, faceState.jawOpen.target, HALF_LIVES.jawOpen, safeDt
  );
  faceState.blinkLeft.current = expDecay(
    faceState.blinkLeft.current, faceState.blinkLeft.target, HALF_LIVES.blinkLeft, safeDt
  );
  faceState.blinkRight.current = expDecay(
    faceState.blinkRight.current, faceState.blinkRight.target, HALF_LIVES.blinkRight, safeDt
  );

  // Head rotation (angular — handles wrap correctly)
  faceState.headRotation.pitch.current = expDecayAngle(
    faceState.headRotation.pitch.current, faceState.headRotation.pitch.target, HALF_LIVES.headPitch, safeDt
  );
  faceState.headRotation.yaw.current = expDecayAngle(
    faceState.headRotation.yaw.current, faceState.headRotation.yaw.target, HALF_LIVES.headYaw, safeDt
  );
  faceState.headRotation.roll.current = expDecayAngle(
    faceState.headRotation.roll.current, faceState.headRotation.roll.target, HALF_LIVES.headRoll, safeDt
  );

  // Head translation (position in camera frame)
  faceState.headTranslation.x.current = expDecay(
    faceState.headTranslation.x.current, faceState.headTranslation.x.target, HALF_LIVES.headTranslationX, safeDt
  );
  faceState.headTranslation.y.current = expDecay(
    faceState.headTranslation.y.current, faceState.headTranslation.y.target, HALF_LIVES.headTranslationY, safeDt
  );
}

/** Adjust a half-life at runtime for live tuning */
export function setHalfLife(feature, seconds) {
  if (Object.prototype.hasOwnProperty.call(HALF_LIVES, feature)) {
    HALF_LIVES[feature] = Math.max(0.001, seconds);
  }
}

export function getHalfLife(feature) {
  return HALF_LIVES[feature] ?? 0;
}
