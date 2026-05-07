import * as vision from "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

const {
  FaceLandmarker,
  FilesetResolver
} = vision;

let faceLandmarker;

export async function createFaceLandmarker() {

    const wasmPath = new URL(
        "./node_modules/@mediapipe/tasks-vision/wasm",
        import.meta.url
    ).href;

    const modelPath = new URL(
        "./face_landmarker.task",
        import.meta.url
    ).href;

  const resolver =
    await FilesetResolver.forVisionTasks(
      wasmPath
    );

  faceLandmarker =
    await FaceLandmarker.createFromOptions(
      resolver,
      {

        baseOptions: {
          modelAssetPath:
            modelPath
        },

        runningMode: "VIDEO",

        outputFaceBlendshapes: true,

        outputFacialTransformationMatrixes: true,

        numFaces: 1
      }
    );

  return faceLandmarker;
}