import {
  createFaceLandmarker
} from "./facelandmarker.js";

const video = document.getElementById("webcam");

async function setupCamera() {

  const stream =
    await navigator.mediaDevices.getUserMedia({
      video: true
    });

  video.srcObject = stream;

  return new Promise((resolve) => {

    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

await setupCamera();

const faceLandmarker = await createFaceLandmarker();
console.log("MediaPipe Ready");

async function predict() {

  const now = performance.now();

  const results =
    faceLandmarker.detectForVideo(
      video,
      now
    );

  // Face found
  if (results.faceBlendshapes.length > 0) {

    const blendShapes =
      results.faceBlendshapes[0].categories;

    const jawOpen =
      blendShapes.find(
        shape =>
          shape.categoryName === "jawOpen"
      );
    
    const eyeBlinkLeft =
      blendShapes.find(
        shape =>
          shape.categoryName === "eyeBlinkLeft"
      );

    const eyeBlinkRight =
      blendShapes.find(
        shape =>
          shape.categoryName === "eyeBlinkRight"
      );
    
    
    console.log(
      "Jaw Open:",
      jawOpen.score.toFixed(2)
    );
    console.log(
      "Eye Blink Left:",
      eyeBlinkLeft.score.toFixed(2)
    );
    console.log(
      "Eye Blink Right:",
      eyeBlinkRight.score.toFixed(2)
    );
  }

  requestAnimationFrame(predict);
}

predict();