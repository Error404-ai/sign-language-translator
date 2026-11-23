import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { CONN, HAND_COLORS, frameToHands } from "./hand-player.js";

/**
 * 3D hand avatar (Three.js). Same input as the 2D skeleton: 130-d keypoint frames from poses.json.
 * Joints are spheres, bones are capsules, the palm is a filled surface. Movement between frames is
 * smoothed (letters glide into each other), the view auto-centres, and you can drag to rotate it
 * (double-click resets).
 */
const PALM = [[0, 1, 5], [0, 5, 9], [0, 9, 13], [0, 13, 17]];
const UNIT = 60;                                  // camera pixels per world unit (hand ~ 1.2 units)
const SMOOTH = 0.35;                              // per-frame easing toward the target pose

export class Avatar3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setSize(canvas.width, canvas.height, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 0.1, 200);
    this.camera.position.set(0, 0, 14);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 6, 10); this.scene.add(sun);

    this.pivot = new THREE.Group(); this.root = new THREE.Group();
    this.pivot.add(this.root); this.scene.add(this.pivot);
    this.hands = [0, 1].map(slot => this.makeHand(slot));
    this.cur = [null, null]; this.target = [null, null];
    this.center = new THREE.Vector3(); this.dist = 14;
    this.dirty = 2;
    this.dragControls();
    this.loop();
  }

  show(on) { this.canvas.hidden = !on; this.dirty = 2; }

  makeHand(slot) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.6 });
    const joint = new THREE.MeshStandardMaterial({ color: HAND_COLORS[slot], roughness: 0.4 });
    const palmMat = new THREE.MeshStandardMaterial({ color: 0xd59a5b, roughness: 0.7, side: THREE.DoubleSide });
    const ball = new THREE.SphereGeometry(1, 16, 12), rod = new THREE.CylinderGeometry(1, 1, 1, 12);
    const joints = Array.from({ length: 21 }, (_, i) => {
      const m = new THREE.Mesh(ball, joint); m.scale.setScalar([4, 8, 12, 16, 20].includes(i) ? 0.12 : 0.14); g.add(m); return m;
    });
    const bones = CONN.map(() => { const m = new THREE.Mesh(rod, skin); g.add(m); return m; });
    const palmGeo = new THREE.BufferGeometry();
    palmGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PALM.length * 9), 3));
    const palm = new THREE.Mesh(palmGeo, palmMat); g.add(palm);
    g.visible = false; this.root.add(g);
    return { g, joints, bones, palm };
  }

  /** frame: 130 floats or null */
  draw(frame) {
    this.target = [null, null];
    for (const { slot, pts } of frameToHands(frame))
      this.target[slot] = pts.map(([x, y, z]) => new THREE.Vector3((x - 320) / UNIT, -(y - 240) / UNIT, -z / UNIT));
    this.dirty = 60;                               // keep rendering while easing toward the new pose
  }

  update() {
    const all = this.target.flatMap(t => t ?? []);   // frame the pose we're heading to, so fast moves stay in view
    for (const slot of [0, 1]) {
      const tgt = this.target[slot], hand = this.hands[slot];
      if (!tgt) { this.cur[slot] = null; hand.g.visible = false; continue; }
      if (!this.cur[slot]) this.cur[slot] = tgt.map(v => v.clone());              // appear in place
      else this.cur[slot].forEach((v, i) => v.lerp(tgt[i], SMOOTH));
      const P = this.cur[slot];
      hand.g.visible = true;
      P.forEach((p, i) => hand.joints[i].position.copy(p));
      CONN.forEach(([a, b], i) => placeBone(hand.bones[i], P[a], P[b], 0.1));
      const pos = hand.palm.geometry.attributes.position;
      PALM.forEach((tri, t) => tri.forEach((j, k) => pos.setXYZ(t * 3 + k, P[j].x, P[j].y, P[j].z)));
      pos.needsUpdate = true; hand.palm.geometry.computeVertexNormals(); hand.palm.geometry.computeBoundingSphere();
    }
    if (all.length) {                              // keep the hands centred and framed
      const box = new THREE.Box3().setFromPoints(all), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      this.center.lerp(c, 0.4);
      this.dist += (Math.max(4, Math.max(s.x / 1.6, s.y) * 2.3) - this.dist) * 0.3;   // fill ~70 % of the view
    }
    this.root.position.copy(this.center).multiplyScalar(-1);
    this.camera.position.z = this.dist;
  }

  loop = () => {
    if (this.dirty > 0 && !this.canvas.hidden) { this.update(); this.renderer.render(this.scene, this.camera); this.dirty--; }
    requestAnimationFrame(this.loop);
  };

  dragControls() {
    let last = null;
    const el = this.canvas;
    el.style.cursor = "grab"; el.style.touchAction = "none";
    el.addEventListener("pointerdown", e => { last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; });
    el.addEventListener("pointermove", e => {
      if (!last) return;
      this.pivot.rotation.y += (e.clientX - last[0]) * 0.01;
      this.pivot.rotation.x = Math.max(-1.2, Math.min(1.2, this.pivot.rotation.x + (e.clientY - last[1]) * 0.01));
      last = [e.clientX, e.clientY]; this.dirty = 2;
    });
    const up = () => { last = null; el.style.cursor = "grab"; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", () => { this.pivot.rotation.set(0, 0, 0); this.dirty = 2; });
  }
}

const UP = new THREE.Vector3(0, 1, 0);
function placeBone(mesh, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(r, len || 1e-3, r);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
}
