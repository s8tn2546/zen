/**
 * Smoothing utilities for animation values
 * Frame-rate-independent exponential decay + spring dynamics
 */

/**
 * Frame-rate-independent lerp using exponential decay.
 * Replaces naive lerp(current, target, speed) which is frame-rate-dependent.
 *
 * @param {number} current   - Current value
 * @param {number} target    - Target value
 * @param {number} halfLife  - Seconds for half the gap to close (lower = snappier)
 * @param {number} dt        - Delta time in seconds this frame
 * @returns {number}
 */
export function expDecay(current, target, halfLife, dt) {
  const h = Math.max(halfLife, 0.001);
  return target + (current - target) * Math.exp(-0.6931471805599453 * dt / h);
}

/**
 * Frame-rate-independent angular lerp with wrapping.
 *
 * @param {number} current   - Current angle in radians
 * @param {number} target    - Target angle in radians
 * @param {number} halfLife  - Half-life in seconds
 * @param {number} dt        - Delta time in seconds
 * @returns {number}
 */
export function expDecayAngle(current, target, halfLife, dt) {
  let diff = target - current;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const h = Math.max(halfLife, 0.001);
  return current + diff * (1 - Math.exp(-0.6931471805599453 * dt / h));
}

/**
 * Deadzone filter — ignores changes smaller than threshold.
 */
export function deadzone(value, threshold, previousValue) {
  return Math.abs(value - previousValue) < threshold ? previousValue : value;
}

/**
 * Spring simulation with velocity for organic overshoot + settle.
 * Mutates state in place.
 *
 * @param {{ value: number, velocity: number }} state
 * @param {number} target
 * @param {number} stiffness  e.g. 120
 * @param {number} damping    e.g. 14  (critical = 2*sqrt(stiffness) ≈ 21.9)
 * @param {number} dt         Delta time in seconds
 * @returns {number} New value
 */
export function springStep(state, target, stiffness, damping, dt) {
  const force = -stiffness * (state.value - target) - damping * state.velocity;
  state.velocity += force * dt;
  state.value    += state.velocity * dt;
  return state.value;
}

// ── Legacy aliases ───────────────────────────────────────────────────────────
/** @deprecated use expDecay */
export function lerp(current, target, speed) {
  return current + (target - current) * speed;
}
/** @deprecated use expDecayAngle */
export function lerpAngle(current, target, speed) {
  let diff = target - current;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return current + diff * speed;
}
export function exponentialSmoothing(current, target, alpha) {
  return alpha * target + (1 - alpha) * current;
}
