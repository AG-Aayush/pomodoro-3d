// scene.js — Three.js 3D apple, progress ring, particles & animation loop

let appleBody; // exported so timer.js can change its color

function initScene() {
  const canvas = document.getElementById('three-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(460, 340);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 460 / 340, 0.1, 100);
  camera.position.set(0, 0.3, 5.8);
  camera.lookAt(0, 0, 0);

  // ── LIGHTS ────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xfff5e6, 0.45));

  const key = new THREE.DirectionalLight(0xffe4cc, 1.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc84b2f, 0.25);
  fill.position.set(-4, 0, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xe8a87c, 0.55);
  rim.position.set(0, -3, -4);
  scene.add(rim);

  // ── APPLE GROUP ───────────────────────────────────────────────────────────
  const appleGroup = new THREE.Group();
  scene.add(appleGroup);

  // Body via lathe geometry
  const pts = [
    [0.0, 1.08], [0.20, 1.04], [0.50, 0.90], [0.80, 0.68],
    [0.97, 0.40], [1.02, 0.08], [1.00, -0.22], [0.90, -0.50],
    [0.74, -0.74], [0.50, -0.92], [0.24, -1.02], [0.0, -1.05]
  ].map(([x, y]) => new THREE.Vector2(x, y));

  appleBody = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 72),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.16, metalness: 0.04 })
  );
  appleBody.castShadow = true;
  appleGroup.add(appleBody);

  // Stem
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.04, 0),
    new THREE.Vector3(0.06, 1.28, 0.02),
    new THREE.Vector3(0.09, 1.55, 0),
    new THREE.Vector3(0.07, 1.72, -0.02),
  ]);
  appleGroup.add(new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 12, 0.033, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x4a2c0a, roughness: 0.82 })
  ));

  // Leaf
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.14, 0.06, 0.33, 0.14, 0.38, 0.34);
  leafShape.bezierCurveTo(0.33, 0.50, 0.18, 0.54, 0.0, 0.48);
  leafShape.bezierCurveTo(-0.10, 0.43, -0.11, 0.28, 0.0, 0.0);

  const leafMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(leafShape, 12),
    new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6, side: THREE.DoubleSide })
  );
  leafMesh.position.set(0.06, 1.44, 0);
  leafMesh.rotation.set(0, 0.5, -0.3);
  appleGroup.add(leafMesh);

  // Subtle highlight sphere
  const hlMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, roughness: 0 })
  );
  hlMesh.position.set(-0.28, 0.48, 0.76);
  appleGroup.add(hlMesh);

  // ── PROGRESS RING ─────────────────────────────────────────────────────────
  const ringGroup = new THREE.Group();
  ringGroup.rotation.x = Math.PI * 0.12;
  ringGroup.position.set(0, 0, -0.6);
  scene.add(ringGroup);

  // Background (dim full circle)
  const bgPts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    bgPts.push(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0);
  }
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute('position', new THREE.Float32BufferAttribute(bgPts, 3));
  ringGroup.add(new THREE.Line(bgGeo,
    new THREE.LineBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.9 })
  ));

  // Active progress arc (updated by timer)
  let progressLine = null;
  window.updateProgressRing = function (remainingSeconds, totalSeconds, mode) {
    if (progressLine) ringGroup.remove(progressLine);
    const progress = remainingSeconds / totalSeconds;
    const segs = 128;
    const count = Math.max(1, Math.floor(segs * progress));
    const pos = [];
    for (let i = 0; i <= count; i++) {
      const a = (i / segs) * Math.PI * 2 - Math.PI / 2;
      pos.push(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    progressLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: mode === 'focus' ? 0xc84b2f : 0x4caf7d,
      transparent: true,
      opacity: 0.75
    }));
    ringGroup.add(progressLine);
  };

  // ── PARTICLES ─────────────────────────────────────────────────────────────
  const pCount = 50;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3]     = (Math.random() - 0.5) * 8;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 6;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 2;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
  scene.add(new THREE.Points(pGeo,
    new THREE.PointsMaterial({ color: 0x220a00, size: 0.05, transparent: true, opacity: 0.35 })
  ));

  // ── MOUSE DRAG ────────────────────────────────────────────────────────────
  let drag = false, prevM = { x: 0, y: 0 };
  let tRY = 0, tRX = 0, cRY = 0, cRX = 0;

  canvas.addEventListener('mousedown', e => {
    drag = true;
    prevM = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', () => drag = false);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    tRY += (e.clientX - prevM.x) * 0.013;
    tRX += (e.clientY - prevM.y) * 0.013;
    tRX = Math.max(-0.85, Math.min(0.85, tRX));
    prevM = { x: e.clientX, y: e.clientY };
  });

  // ── ANIMATION LOOP ────────────────────────────────────────────────────────
  let bob = 0, pScale = 1, pDir = 1;

  function animate() {
    requestAnimationFrame(animate);

    cRY += (tRY - cRY) * 0.09;
    cRX += (tRX - cRX) * 0.09;
    if (!drag) tRY += 0.004;

    appleGroup.rotation.y = cRY;
    appleGroup.rotation.x = cRX;

    bob += 0.016;
    appleGroup.position.y = Math.sin(bob) * 0.065;

    // Subtle pulse when timer is running (checked via global state)
    if (window.timerRunning) {
      pScale += 0.0004 * pDir;
      if (pScale > 1.018) pDir = -1;
      if (pScale < 0.982) pDir = 1;
      appleGroup.scale.setScalar(pScale);
    } else {
      appleGroup.scale.setScalar(1);
    }

    renderer.render(scene, camera);
  }

  animate();
}

// Expose apple body color change for timer.js
window.setAppleColor = function (hex) {
  if (appleBody) appleBody.material.color.setHex(hex);
};

function openProfileImage(){
  document.getElementById("image-viewer").classList.add("show");
}

document.addEventListener("click", function(e){

  const viewer = document.getElementById("image-viewer");
  const pic = document.querySelector(".profile-pic");
  const img = document.querySelector(".viewer-img");

  if(
    viewer.classList.contains("show") &&
    !img.contains(e.target) &&
    !pic.contains(e.target)
  ){
    viewer.classList.remove("show");
  }

});