const video = document.getElementById("webcam");

async function setupCamera() {

  const stream =
    await navigator.mediaDevices.getUserMedia({
      video: true
    });

  video.srcObject = stream;
}

setupCamera();