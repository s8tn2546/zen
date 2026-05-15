/**
 * Head rotation extraction from MediaPipe facial transformation matrix.
 *
 * MediaPipe outputs a 4×4 row-major matrix.  The upper-left 3×3 is the
 * rotation, the bottom row is translation (in MediaPipe camera space).
 *
 * Coordinate conventions (MediaPipe → Three.js mapping):
 *   pitch  = tilt up/down  → Three.js rotation.x  (negate: MP pitch-down = positive X)
 *   yaw    = turn L/R      → Three.js rotation.y  (negate: MP yaw-right = positive Y in mirror)
 *   roll   = head tilt     → Three.js rotation.z  (negate for mirror)
 *
 * We extract intrinsic XYZ Euler angles from the rotation sub-matrix.
 */

/**
 * @param {number[] | Float32Array | { data: Float32Array } | { elements: number[] }} mat
 * @returns {{ pitch: number, yaw: number, roll: number, tx: number, ty: number }}
 */
export function extractHeadRotation(mat) {
  let arr = null;

  if (!mat) return { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0 };

  if (Array.isArray(mat) || ArrayBuffer.isView(mat)) {
    arr = mat;
  } else if (mat.data  && (Array.isArray(mat.data)     || ArrayBuffer.isView(mat.data)))     {
    arr = mat.data;
  } else if (mat.elements && (Array.isArray(mat.elements) || ArrayBuffer.isView(mat.elements))) {
    arr = mat.elements;
  }

  if (!arr || arr.length < 16) return { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0 };

  // Row-major layout:
  //  [0]  [1]  [2]  [3]
  //  [4]  [5]  [6]  [7]
  //  [8]  [9]  [10] [11]
  //  [12] [13] [14] [15]
  const r00 = +arr[0];  const r01 = +arr[1];  const r02 = +arr[2];
  const r10 = +arr[4];  const r11 = +arr[5];  const r12 = +arr[6];
  const r20 = +arr[8];  const r21 = +arr[9];  const r22 = +arr[10];

  // Translation (camera-space X/Y, normalized roughly to [-1,1] for a typical FOV)
  const tx = +arr[12];
  const ty = +arr[13];

  // Intrinsic XYZ Euler decomposition (R = Rx * Ry * Rz)
  //   pitch = asin(-r20)          [clamped for numerical safety]
  //   yaw   = atan2(r10, r00)
  //   roll  = atan2(r21, r22)
  let pitch = Math.asin(Math.max(-1, Math.min(1, -r20)));
  let yaw   = Math.atan2(r10, r00);
  let roll  = Math.atan2(r21, r22);

  // Mirror correction: webcam is mirrored, so yaw and roll need negation
  // to produce intuitive "left = left" behaviour in Three.js.
  yaw  = -yaw;
  roll = -roll;

  // Pitch sign: MediaPipe pitch-down is a positive value in our decomposition
  // but Three.js rotation.x positive tilts the top of the object toward the viewer.
  // We negate so "look down" → head tips forward visually.
  pitch = -pitch;

  return { pitch, yaw, roll, tx, ty };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function radiansToDegrees(r) { return r * (180 / Math.PI); }
export function degreesToRadians(d) { return d * (Math.PI / 180); }

export function normalizeAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
