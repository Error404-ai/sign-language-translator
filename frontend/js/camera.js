import { config } from "./config.js";

const { HandLandmarker, FaceDetector, FilesetResolver } = await import(config.mediapipe.bundle);
const { width: W, height: H } = config.frame;

/**
 * Webcam + MediaPipe. Detection runs on a mirrored copy of each frame (selfie view, same as training),
 * so landmark x/y match what the user sees on screen.
 *   const cam = new Camera(canvas); await cam.start(onFrame)
 *   onFrame({ hands, face: {x,y,w,h} | null, t, detectMs })   (face only while enableFace())
 *   t = performance.now() when the frame was grabbed, detectMs = MediaPipe time for it (latency probe)
 */
export class Camera {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.video = Object.assign(document.createElement("video"), { playsInline: true, muted: true });
    this.off = Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.octx = this.off.getContext("2d");
    this.lastT = -1; this.hands = []; this.face = null; this.faceOn = false;
  }

  async start(onFrame) {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: W, height: H } });
    await this.video.play();
    this.draw();
    this.files = await FilesetResolver.forVisionTasks(config.mediapipe.wasm);
    this.landmarker = await HandLandmarker.createFromOptions(this.files, {
      baseOptions: { modelAssetPath: config.mediapipe.handModel },
      runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    this.onFrame = onFrame;
    this.detect();
  }

  /** Face detection is only needed by Trends mode, so the model loads lazily. */
  async enableFace() {
    this.faceDetector ??= await FaceDetector.createFromOptions(this.files, {
      baseOptions: { modelAssetPath: config.mediapipe.faceModel }, runningMode: "VIDEO",
    });
    this.faceOn = true;
  }
  disableFace() { this.faceOn = false; this.face = null; }

  detect = () => {
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastT) {
      this.lastT = this.video.currentTime;
      const o = this.octx;
      o.save(); o.translate(W, 0); o.scale(-1, 1); o.drawImage(this.video, 0, 0, W, H); o.restore();
      const t = performance.now();
      const hands = this.landmarker.detectForVideo(this.off, t);
      this.hands = hands.landmarks || [];
      if (this.faceOn && this.faceDetector) {
        const b = this.faceDetector.detectForVideo(this.off, t).detections?.[0]?.boundingBox;
        this.face = b ? { x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H } : null;
      }
      this.onFrame({ hands, face: this.faceOn ? this.face : null, t, detectMs: performance.now() - t });
    }
    requestAnimationFrame(this.detect);
  };

  draw = () => {
    const { ctx, canvas: c } = this;
    ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(this.video, 0, 0, c.width, c.height); ctx.restore();
    ctx.fillStyle = "#f87171";
    this.hands.forEach(h => h.forEach(p => { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, 4, 0, 7); ctx.fill(); }));
    if (this.face) {
      ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.strokeRect(this.face.x * c.width, this.face.y * c.height, this.face.w * c.width, this.face.h * c.height);
      ctx.setLineDash([]);
    }
    requestAnimationFrame(this.draw);
  };
}

