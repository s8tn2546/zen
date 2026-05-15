/**
 * Centralized face state
 * Tracking writes .target; rendering reads .current.
 * animationPipeline.js smooths current toward target each frame.
 */

export const faceState = {
  // Jaw / mouth openness  (0 = closed, 1 = wide open)
  jawOpen: { current: 0, target: 0 },

  // Eye blink  (0 = open, 1 = fully closed)
  blinkLeft:  { current: 0, target: 0 },
  blinkRight: { current: 0, target: 0 },

  // Head rotation in radians
  headRotation: {
    pitch: { current: 0, target: 0 },   // X — nod
    yaw:   { current: 0, target: 0 },   // Y — turn
    roll:  { current: 0, target: 0 },   // Z — tilt
  },

  // Head translation — lateral/vertical shift of face in camera frame
  // Normalized: 0 = centre, ±0.5 = near edge of typical frame
  headTranslation: {
    x: { current: 0, target: 0 },
    y: { current: 0, target: 0 },
  },

  // Tracking quality (0 = lost, 1 = confident)
  // Set by the tracking loop so idle systems can fire when face is lost
  trackingConfidence: 1,
};

export function resetFaceState() {
  faceState.jawOpen.current = 0;  faceState.jawOpen.target = 0;
  faceState.blinkLeft.current  = 0; faceState.blinkLeft.target  = 0;
  faceState.blinkRight.current = 0; faceState.blinkRight.target = 0;

  for (const axis of ['pitch', 'yaw', 'roll']) {
    faceState.headRotation[axis].current = 0;
    faceState.headRotation[axis].target  = 0;
  }
  for (const axis of ['x', 'y']) {
    faceState.headTranslation[axis].current = 0;
    faceState.headTranslation[axis].target  = 0;
  }
  faceState.trackingConfidence = 1;
}
