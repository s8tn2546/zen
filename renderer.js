/**
 * renderer.js — main entry point
 *
 * Two loops, one clock:
 *   animate()  — runs at display refresh (rAF), owns the clock, drives everything
 *   predict()  — MediaPipe tracking, called inside animate() every ~33ms (≈30fps cap)
 *
 * Fixes vs. original:
 *   1. predict() no longer owns its own rAF chain — no more runaway async stacking
 *   2. dt (delta time in seconds) is computed from the rAF timestamp and passed to
 *      updateAnimation() and avatar.update() so smoothing is frame-rate-independent
 *   3. Head translation (tx, ty) extracted from the matrix and fed into faceState
 *   4. Tracking-lost guard: if faceBlendshapes is empty for >300ms, confidence → 0
 */

import * as THREE from './node_modules/three/build/three.module.js';
import { createFaceLandmarker } from './facelandmarker.js';
import { faceState } from './faceState.js';
import { extractHeadRotation } from './rotationUtils.js';
import { updateAnimation } from './animationPipeline.js';
import { createAvatar } from './avatar.js';

// ── DOM ───────────────────────────────────────────────────────────────────────
const video = document.getElementById('webcam');

let canvasContainer = document.getElementById('canvas-container');
if (!canvasContainer) {
  canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  canvasContainer.style.cssText = 'width:100%;height:100%;';
  document.getElementById('app').appendChild(canvasContainer);
}

// ── Camera setup ──────────────────────────────────────────────────────────────
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => { video.onloadedmetadata = () => resolve(video); });
}

await setupCamera();
const faceLandmarker = await createFaceLandmarker();
console.log('[Zen] MediaPipe ready');

// ── Three.js setup ────────────────────────────────────────────────────────────
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const getW = () => canvasContainer.clientWidth  || window.innerWidth  || 640;
const getH = () => canvasContainer.clientHeight || window.innerHeight || 480;

const camera = new THREE.PerspectiveCamera(35, getW() / getH(), 0.01, 100);
camera.position.set(0, 0, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
renderer.setSize(getW(), getH());
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasContainer.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = getW() / getH();
  camera.updateProjectionMatrix();
  renderer.setSize(getW(), getH());
});

// ── Avatar ────────────────────────────────────────────────────────────────────
const avatar = await createAvatar(scene, faceState);
console.log('[Zen] Avatar ready');

// ── Tracking state ────────────────────────────────────────────────────────────
// We cap MediaPipe calls at ~30fps independently of the render frame rate.
const TRACK_INTERVAL_MS = 33;
let   lastTrackTime     = -Infinity;
let   lastFaceSeenTime  = performance.now();

// How long to wait before treating tracking as "lost"
const LOST_FACE_TIMEOUT_MS = 300;

// Translation scale — MediaPipe tx/ty are in millimetres at ~60cm.
// We normalise to roughly [-0.5, 0.5] for a person centred in a typical webcam frame.
const TX_SCALE = 1 / 200;
const TY_SCALE = 1 / 180;

function runTracking(nowMs) {
  if (nowMs - lastTrackTime < TRACK_INTERVAL_MS) return;
  lastTrackTime = nowMs;

  let results;
  try {
    results = faceLandmarker.detectForVideo(video, nowMs);
  } catch (e) {
    // detectForVideo can throw if the video element is not ready yet
    return;
  }

  if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
    lastFaceSeenTime = nowMs;
    faceState.trackingConfidence = 1;

    const shapes = results.faceBlendshapes[0].categories;
    const find   = name => shapes.find(s => s.categoryName === name)?.score ?? 0;

    faceState.jawOpen.target      = find('jawOpen');
    faceState.blinkLeft.target    = find('eyeBlinkLeft');
    faceState.blinkRight.target   = find('eyeBlinkRight');

    if (results.facialTransformationMatrixes?.length > 0) {
      const { pitch, yaw, roll, tx, ty } = extractHeadRotation(
        results.facialTransformationMatrixes[0]
      );
      faceState.headRotation.pitch.target = pitch;
      faceState.headRotation.yaw.target   = yaw;
      faceState.headRotation.roll.target  = roll;

      // Translate camera-space position to normalised avatar-space offsets
      faceState.headTranslation.x.target  = tx * TX_SCALE;
      faceState.headTranslation.y.target  = ty * TY_SCALE;
    }
  } else {
    // No face detected
    if (nowMs - lastFaceSeenTime > LOST_FACE_TIMEOUT_MS) {
      faceState.trackingConfidence = 0;
      // Gently return head to neutral when face is lost
      faceState.headRotation.pitch.target = 0;
      faceState.headRotation.yaw.target   = 0;
      faceState.headRotation.roll.target  = 0;
      faceState.headTranslation.x.target  = 0;
      faceState.headTranslation.y.target  = 0;
      faceState.jawOpen.target            = 0;
      // Do NOT zero blinkLeft/Right — avatar.js auto-blink handles this
    }
  }
}

// ── Main render loop ──────────────────────────────────────────────────────────
let prevTimestamp = null;

function animate(timestamp) {
  requestAnimationFrame(animate);

  // Compute delta time
  if (prevTimestamp === null) { prevTimestamp = timestamp; }
  const dt = Math.min((timestamp - prevTimestamp) / 1000, 0.1); // clamp to 100ms
  prevTimestamp = timestamp;

  // Run tracking (throttled internally)
  runTracking(timestamp);

  // Smooth all face state values
  updateAnimation(dt);

  // Update avatar transforms
  avatar.update(dt);

  // Render
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
