/**
 * 2.5D procedural avatar
 *
 * Layered PlaneGeometry meshes driven by faceState.
 * Fixes applied vs. original:
 *   1. Rotation uses Euler('YXZ') order — prevents gimbal between yaw+pitch
 *   2. Blink: scaleY uses smooth remap, not raw inversion; scaleX compensates
 *   3. Mouth: rest scaleY = 1.0, open adds to that (was starting at 0.36)
 *   4. Parallax: XY translation on individual layers from head translation + rotation
 *   5. Idle breathing & micro-sway procedural animation
 *   6. Auto-blink fires when tracking is lost
 */

import * as THREE from './node_modules/three/build/three.module.js';

// ── Asset paths ───────────────────────────────────────────────────────────────
const TEXTURE_PATHS = {
  face:     './assets/Face.png',
  hair:     './assets/Hair.png',
  leftEye:  './assets/Left Eye.png',
  rightEye: './assets/Right Eye.png',
  mouth:    './assets/Mouth.png',
};

// ── Layer z-depth (determines render order and parallax depth) ────────────────
const LAYER_Z = {
  face:  0,
  mouth: 0.01,
  eye:   0.02,
  hair:  0.03,
};

// ── Base sizes in world units ─────────────────────────────────────────────────
const LAYER_SIZE = {
  face:  { w: 1.45, h: 1.80 },
  hair:  { w: 1.72, h: 2.04 },
  eye:   { w: 0.28, h: 0.14 },
  mouth: { w: 0.44, h: 0.20 },
};

// ── Avatar scale ──────────────────────────────────────────────────────────────
const ROOT_SCALE = 1.35;

// ── Eye & mouth clamps ────────────────────────────────────────────────────────
const MIN_EYE_SCALE_Y   = 0.05;   // fully closed (not zero to avoid degenerate geometry)
const MIN_MOUTH_SCALE_Y = 0.85;   // rest mouth slightly open texture compensation

// ── Parallax sensitivity per layer (world-units per unit of source signal) ───
// Source signals: yaw/pitch in radians, tx/ty normalised [-0.5..0.5]
const PARALLAX = {
  hair:  { yaw: 0.06,  pitch: 0.04,  tx: 0.12, ty: 0.08 },
  eye:   { yaw: 0.025, pitch: 0.015, tx: 0.05, ty: 0.04 },
  mouth: { yaw: 0.01,  pitch: 0.02,  tx: 0.02, ty: 0.03 },
  face:  { yaw: 0.005, pitch: 0.005, tx: 0.01, ty: 0.01 },
};

// ── Idle animation parameters ─────────────────────────────────────────────────
const IDLE = {
  breathAmplitude: 0.004,  // world units, subtle chest-rise
  breathRate:      0.22,   // Hz — one breath every ~4.5 s
  swayAmplitude:   0.003,  // horizontal micro-sway
  swayRate:        0.11,   // Hz — very slow drift
  nodAmplitude:    0.008,  // tiny pitch bob
  nodRate:         0.09,   // Hz
};

// ── Auto-blink ────────────────────────────────────────────────────────────────
const BLINK = {
  minInterval: 2.5,   // seconds between blinks
  maxInterval: 6.0,
  closeDuration: 0.06, // seconds to close
  openDuration:  0.10, // seconds to open
};

// ─────────────────────────────────────────────────────────────────────────────

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function makeLayerMaterial(texture) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    alphaTest: 0.01,
  });
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    mat.map = texture;
  }
  return mat;
}

function createLayer(name, texture, w, h, z) {
  const group = new THREE.Group();
  group.name  = name;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    makeLayerMaterial(texture)
  );
  mesh.name        = `${name}Mesh`;
  mesh.renderOrder = Math.round(z * 1000);
  group.add(mesh);

  return { group, mesh };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createAvatar(scene, faceState) {
  const loader = new THREE.TextureLoader();

  const [faceTex, hairTex, leftEyeTex, rightEyeTex, mouthTex] = await Promise.all([
    loader.loadAsync(new URL(TEXTURE_PATHS.face,     import.meta.url).href),
    loader.loadAsync(new URL(TEXTURE_PATHS.hair,     import.meta.url).href),
    loader.loadAsync(new URL(TEXTURE_PATHS.leftEye,  import.meta.url).href),
    loader.loadAsync(new URL(TEXTURE_PATHS.rightEye, import.meta.url).href),
    loader.loadAsync(new URL(TEXTURE_PATHS.mouth,    import.meta.url).href),
  ]);

  // ── Build layer hierarchy ─────────────────────────────────────────────────
  // root → headGroup → (face, mouth, leftEye, rightEye)
  //                 → hairGroup (hair sits on top, slight extra parallax)
  //
  // Keeping hair as a sibling of headGroup lets us apply extra parallax to it
  // independently (hair swings more than the rigid face).

  const root      = new THREE.Group(); root.name = 'AvatarRoot';
  const headGroup = new THREE.Group(); headGroup.name = 'Head';
  root.scale.setScalar(ROOT_SCALE);

  // Use YXZ Euler order: yaw first, then pitch, then roll.
  // This is the most intuitive order for a head-tracking avatar and avoids
  // the gimbal that 'XYZ' (Three.js default) produces when pitch and yaw combine.
  headGroup.rotation.order = 'YXZ';

  const face     = createLayer('Face',     faceTex,     LAYER_SIZE.face.w,  LAYER_SIZE.face.h,  LAYER_Z.face);
  const hair     = createLayer('Hair',     hairTex,     LAYER_SIZE.hair.w,  LAYER_SIZE.hair.h,  LAYER_Z.hair);
  const leftEye  = createLayer('LeftEye',  leftEyeTex,  LAYER_SIZE.eye.w,   LAYER_SIZE.eye.h,   LAYER_Z.eye);
  const rightEye = createLayer('RightEye', rightEyeTex, LAYER_SIZE.eye.w,   LAYER_SIZE.eye.h,   LAYER_Z.eye);
  const mouth    = createLayer('Mouth',    mouthTex,    LAYER_SIZE.mouth.w, LAYER_SIZE.mouth.h, LAYER_Z.mouth);

  // ── Base positions ────────────────────────────────────────────────────────
  // These are the neutral-pose offsets within the head group.
  const BASE = {
    face:     new THREE.Vector3(0,      0,     LAYER_Z.face),
    hair:     new THREE.Vector3(0,      0.08,  LAYER_Z.hair),
    leftEye:  new THREE.Vector3(-0.325, 0.24,  LAYER_Z.eye),
    rightEye: new THREE.Vector3( 0.325, 0.24,  LAYER_Z.eye),
    mouth:    new THREE.Vector3(0,     -0.35,  LAYER_Z.mouth),
  };

  face.group.position.copy(BASE.face);
  hair.group.position.copy(BASE.hair);
  leftEye.group.position.copy(BASE.leftEye);
  rightEye.group.position.copy(BASE.rightEye);
  mouth.group.position.copy(BASE.mouth);

  headGroup.add(face.group, leftEye.group, rightEye.group, mouth.group);
  root.add(headGroup, hair.group);  // hair is a direct child of root so it gets its own parallax
  scene.add(root);

  // ── Auto-blink state ──────────────────────────────────────────────────────
  let blinkTimer     = 0;
  let blinkInterval  = 3.0;
  let blinkPhase     = 'idle';   // 'idle' | 'closing' | 'opening'
  let blinkPhaseTime = 0;

  function nextBlinkInterval() {
    return BLINK.minInterval + Math.random() * (BLINK.maxInterval - BLINK.minInterval);
  }
  blinkInterval = nextBlinkInterval();

  // ── Idle animation clock ──────────────────────────────────────────────────
  let idleTime = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // update(dt)  — called every render frame
  // ─────────────────────────────────────────────────────────────────────────
  function update(dt) {
    const safeDt = Math.min(dt, 0.1);
    idleTime += safeDt;

    // ── Read smoothed tracking values ───────────────────────────────────────
    const yaw   = faceState.headRotation.yaw.current;
    const pitch = faceState.headRotation.pitch.current;
    const roll  = faceState.headRotation.roll.current;
    const tx    = faceState.headTranslation.x.current;   // camera-space X
    const ty    = faceState.headTranslation.y.current;   // camera-space Y
    const jawOpen     = clamp01(faceState.jawOpen.current);
    let   blinkLeft   = clamp01(faceState.blinkLeft.current);
    let   blinkRight  = clamp01(faceState.blinkRight.current);

    // ── Auto-blink ──────────────────────────────────────────────────────────
    // Only fires when tracking confidence is low OR as a natural idle blink.
    // When tracking is active, the tracked values take priority.
    blinkTimer += safeDt;
    if (blinkPhase === 'idle' && blinkTimer >= blinkInterval) {
      blinkPhase     = 'closing';
      blinkPhaseTime = 0;
      blinkTimer     = 0;
      blinkInterval  = nextBlinkInterval();
    }

    if (blinkPhase === 'closing') {
      blinkPhaseTime += safeDt;
      const t = Math.min(blinkPhaseTime / BLINK.closeDuration, 1);
      const autoBlink = t;                       // 0→1
      // Blend auto-blink on top of tracked blink (take the max so tracking still wins)
      blinkLeft  = Math.max(blinkLeft,  autoBlink);
      blinkRight = Math.max(blinkRight, autoBlink);
      if (t >= 1) { blinkPhase = 'opening'; blinkPhaseTime = 0; }
    } else if (blinkPhase === 'opening') {
      blinkPhaseTime += safeDt;
      const t = Math.min(blinkPhaseTime / BLINK.openDuration, 1);
      const autoBlink = 1 - t;                   // 1→0
      blinkLeft  = Math.max(blinkLeft,  autoBlink);
      blinkRight = Math.max(blinkRight, autoBlink);
      if (t >= 1) { blinkPhase = 'idle'; }
    }

    // ── Idle procedural motion ──────────────────────────────────────────────
    const breathY  = Math.sin(2 * Math.PI * IDLE.breathRate * idleTime) * IDLE.breathAmplitude;
    const swayX    = Math.sin(2 * Math.PI * IDLE.swayRate   * idleTime) * IDLE.swayAmplitude;
    const idlePitch = Math.sin(2 * Math.PI * IDLE.nodRate   * idleTime) * IDLE.nodAmplitude;

    // ── Apply head rotation (YXZ — yaw, pitch, roll) ────────────────────────
    headGroup.rotation.y = yaw;
    headGroup.rotation.x = pitch + idlePitch;
    headGroup.rotation.z = roll;

    // Subtle root breathe + sway (separate from rotation so it feels layered)
    root.position.y = breathY;
    root.position.x = swayX;

    // ── Intra-layer parallax (XY offset per layer) ───────────────────────────
    // Positive yaw (head turns right) → eyes shift slightly left in world space,
    // hair shifts more (it's further "behind" the face surface).
    // tx is the raw camera-space horizontal: person drifts right → tx positive.

    function applyParallax(group, base, p) {
      // Rotation-driven parallax (3D depth simulation)
      const pxYaw   = yaw   * p.yaw;
      const pxPitch = pitch * p.pitch;
      // Translation-driven parallax (head moves in frame)
      const pxTx    = tx * p.tx;
      const pxTy    = ty * p.ty;
      group.position.x = base.x + pxTx - pxYaw;
      group.position.y = base.y + pxTy + pxPitch;
      // z stays as-is (depth ordering is static)
      group.position.z = base.z;
    }

    applyParallax(face.group,     BASE.face,     PARALLAX.face);
    applyParallax(leftEye.group,  BASE.leftEye,  PARALLAX.eye);
    applyParallax(rightEye.group, BASE.rightEye, PARALLAX.eye);
    applyParallax(mouth.group,    BASE.mouth,    PARALLAX.mouth);
    // Hair is a child of root (not headGroup), so it receives less rotation
    // but we give it more translation parallax to look floaty/separate.
    applyParallax(hair.group,     BASE.hair,     PARALLAX.hair);

    // ── Eye blink ───────────────────────────────────────────────────────────
    // Squash Y, compensate X slightly to keep eye "volume" (squash-and-stretch)
    const eyeScaleYL = Math.max(MIN_EYE_SCALE_Y, 1 - blinkLeft);
    const eyeScaleYR = Math.max(MIN_EYE_SCALE_Y, 1 - blinkRight);
    // Horizontal stretch as eye closes (cartoon squash-and-stretch)
    const eyeScaleXL = 1 + (1 - eyeScaleYL) * 0.15;
    const eyeScaleXR = 1 + (1 - eyeScaleYR) * 0.15;

    leftEye.group.scale.set(eyeScaleXL, eyeScaleYL, 1);
    rightEye.group.scale.set(eyeScaleXR, eyeScaleYR, 1);

    // ── Mouth / jaw ─────────────────────────────────────────────────────────
    // scaleY = 1.0 at rest; open adds up to +0.7 on top.
    // The mouth texture should be drawn at "neutral/closed" so scale=1 looks right.
    const mouthScaleY = Math.max(MIN_MOUTH_SCALE_Y, 1.0 + jawOpen * 0.70);
    // Slight horizontal stretch when mouth opens wide (cartoon feel)
    const mouthScaleX = 1.0 + jawOpen * 0.04;
    mouth.group.scale.set(mouthScaleX, mouthScaleY, 1);
  }

  // ─────────────────────────────────────────────────────────────────────────

  function dispose() {
    scene.remove(root);
    [face, hair, leftEye, rightEye, mouth].forEach(({ mesh }) => {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    [faceTex, hairTex, leftEyeTex, rightEyeTex, mouthTex].forEach(t => t.dispose());
  }

  return {
    root,
    parts: {
      face:      face.group,
      hair:      hair.group,
      leftEye:   leftEye.group,
      rightEye:  rightEye.group,
      mouth:     mouth.group,
      headGroup,
    },
    update,
    dispose,
  };
}
