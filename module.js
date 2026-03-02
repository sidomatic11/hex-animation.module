(function () {
  const canvas = document.getElementById('hex-canvas');
  const ctx = canvas.getContext('2d');

  // Config
  const BG = '#080c24';
  const ORANGE = '#FF5B26';
  const BLUE_LEFT = '#1a4d8c';   // Darkest – left face (shadowed)
  const BLUE_RIGHT = '#2d7dd2';  // Lightest – right face (lit)
  const BLUE_TOP = '#2563b8';    // Mid – top face
  const BLUE_BACK = '#1a3a5c';  // Dark blue – back faces (bottom, back-left, back-right)

  // Face images (loaded async) – same folder as index.html
  const FACE_IMAGES = { left: new Image(), right: new Image(), top: new Image(), back: new Image() };
  FACE_IMAGES.left.src = 'side=left.svg';
  FACE_IMAGES.right.src = 'side=right.svg';
  FACE_IMAGES.top.src = 'side=top.svg';
  FACE_IMAGES.back.src = 'side=back.svg';

  // Front-face shuffle: pool of 3 images; each face cycles through them and lands on one randomly
  const FRONT_FACE_POOL = [FACE_IMAGES.left, FACE_IMAGES.right, FACE_IMAGES.top];
  let frontDisplayIndices = [0, 1, 2];  // which image each face (left, right, top) shows
  const perfNow = typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now;
  let shuffleState = {
    phase: 'idle',
    nextShuffleAt: perfNow() + 4000 + Math.random() * 1000,  // first shuffle after 4–6s
    shuffleStartTime: 0,
    shuffleDuration: 0,
    lastCycleTime: 0,
    cycleIntervalMs: 45
  };

  let mouseX = null;
  let mouseY = null;
  let currentSpread = 0;
  const SMOOTH_SPEED = 0.06;  // Lower = slower (0.04–0.1 typical)
  const BACK_SPREAD_FACTOR = 1.5;  // Back faces spread less than front (0–1)

  // Glass-lava HUD animation state (reference design uses bgRadius 280)
  // Perf: blur removed (ctx.filter is expensive); 3 rings; 3 blobs
  let time = 0;
  let rings = [];
  let blobs = [];
  const RING_CONFIGS = [
    { radius: 60, baseSpeed: 0.003, thickness: 90, dash: [180, 90], color: 'rgba(255, 255, 255, 0.14)' },
    { radius: 105, baseSpeed: -0.002, thickness: 120, dash: [300, 120], color: 'rgba(255, 236, 179, 0.1)' },
    { radius: 205, baseSpeed: -0.0025, thickness: 120, dash: [550, 180], color: 'rgba(255, 255, 255, 0.07)' }
  ];

  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) - rect.width / 2;
    mouseY = (e.clientY - rect.top) - rect.height / 2;
  });
  canvas.addEventListener('mouseleave', function () {
    mouseX = null;
    mouseY = null;
  });

  // Match canvas size to wrapper; scale for high-DPI (Retina) to avoid pixelation
  let cssWidth = 0, cssHeight = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    cssWidth = canvas.parentElement.offsetWidth;
    cssHeight = canvas.parentElement.offsetHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  window.addEventListener('resize', resize);
  resize();

  // Isometric projection: 30° horizontal axes, Y-down screen coords
  const ISO_X = Math.cos(Math.PI / 6);  // cos(30°) ≈ 0.866
  const ISO_Y = Math.sin(Math.PI / 6);  // sin(30°) ≈ 0.5

  /**
   * Draws an image into a parallelogram with correct skew. Vertices: top-left, top-right, bottom-right, bottom-left.
   * Composes transform with parent (keeps translate); maps unit square to parallelogram.
   */
  function drawImageInParallelogram(img, x0, y0, x1, y1, x2, y2, x3, y3) {
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.transform(x1 - x0, y1 - y0, x3 - x0, y3 - y0, 0, 0);
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    ctx.clip();
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 1, 1);
    ctx.restore();
  }

  /**
   * Lerps `current` toward `target` with ease-in-out (slow start & end, faster in middle).
   * @param {number} current - Current value
   * @param {number} target - Target value
   * @param {number} speed - Base lerp speed (0.04–0.1 typical)
   * @param {number} [maxDelta] - Optional scale for normalizing distance; uses |target| if omitted
   */
  function lerpEaseInOut(current, target, speed, maxDelta) {
    var delta = target - current;
    var range = maxDelta != null ? maxDelta : Math.max(1, Math.abs(target));
    var normalizedDist = Math.min(1, Math.abs(delta) / range);
    var easeInOut = normalizedDist * (1 - normalizedDist) * 4;  // 0 at ends, 1 at middle
    return current + delta * speed * (0.85 + easeInOut * 0.15);  // Subtle ease (was 0.5–1.5, now 0.85–1)
  }

  /**
   * Computes shared isometric cube geometry (reused by back and front face drawing).
   * @returns {Object} geom - cx, cy, s, w, h, spreadAmount, and spread deltas for each face
   */
  function computeCubeGeometry(cx, cy, size, spread) {
    const s = size;
    const w = s * ISO_X;
    const h = s * ISO_Y;
    const spreadAmount = spread || 0;
    const backSpreadAmount = spreadAmount * BACK_SPREAD_FACTOR;
    return {
      cx, cy, s, w, h, spreadAmount,
      leftDx: -spreadAmount * ISO_X,
      leftDy: spreadAmount * ISO_Y,
      rightDx: spreadAmount * ISO_X,
      rightDy: spreadAmount * ISO_Y,
      backSpreadAmount,
      backLeftDx: -backSpreadAmount * ISO_X,
      backLeftDy: backSpreadAmount * ISO_Y,
      backRightDx: backSpreadAmount * ISO_X,
      backRightDy: backSpreadAmount * ISO_Y
    };
  }

  /**
   * Ring for glass-lava HUD: dashed concentric circle with blur and glow.
   * Values are scaled at draw time to match circle radius.
   */
  function Ring(config) {
    this.config = config;
    this.offset = Math.random() * 1000;
  }
  Ring.prototype.update = function () {
    const speedVar = Math.sin(time * 0.3) * 0.0005;
    this.offset += (this.config.baseSpeed + speedVar) * 60;
  };
  Ring.prototype.draw = function (scale) {
    const c = this.config;
    const r = c.radius * scale;
    const t = c.thickness * scale;
    const d = [c.dash[0] * scale, c.dash[1] * scale];
    ctx.save();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = t;
    ctx.setLineDash(d);
    ctx.lineDashOffset = -this.offset;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  function createBlobs() {
    blobs = [];
    for (let i = 0; i < 3; i++) {
      blobs.push({
        size: 220 + Math.random() * 200,
        angle: Math.random() * Math.PI * 2,
        dist: 40 + Math.random() * 100,
        speed: 0.003 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  /**
   * Draws the lava-lamp gradient circle with animated blobs.
   * Clips to bgRadius; center is at (0,0) after translate.
   */
  function drawLavaLamp(bgRadius) {
    const scale = bgRadius / 280;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, bgRadius, 0, Math.PI * 2);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bgRadius);
    bgGrad.addColorStop(0, '#FF8A4D');
    bgGrad.addColorStop(0.8, '#FF7029');
    bgGrad.addColorStop(1, '#A63F0F');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    blobs.forEach(function (blob) {
      blob.angle += blob.speed;
      const movement = Math.sin(time * 0.5 + blob.phase) * 40 * scale;
      const bx = Math.cos(blob.angle) * (blob.dist * scale + movement);
      const by = Math.sin(blob.angle * 0.7) * (blob.dist * scale + movement);
      const size = blob.size * scale;
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, size);
      grad.addColorStop(0, 'rgba(255, 236, 179, 0.25)');
      grad.addColorStop(0.7, 'rgba(255, 112, 41, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, size, 0, Math.PI * 2);
      ctx.fill();
    });

    const innerShadow = ctx.createRadialGradient(0, 0, bgRadius * 0.85, 0, 0, bgRadius);
    innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
    innerShadow.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = innerShadow;
    ctx.fill();
    ctx.restore();
  }

  /** Draws back faces (bottom, back-left, back-right) – rendered behind the circle. */
  function drawBackFaces(geom) {
    const { cx, cy, w, h, s, backSpreadAmount, backLeftDx, backLeftDy, backRightDx, backRightDy } = geom;
    const backImg = FACE_IMAGES.back;

    function drawBackFacePath(x0, y0, x1, y1, x2, y2, x3, y3) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
    }

    if (backImg.complete && backImg.naturalWidth) {
      // Bottom face – diamond: top, right, bottom, left (same order as original path)
      drawImageInParallelogram(backImg,
        cx, cy + h + backSpreadAmount,
        cx + w, cy + 2 * h + backSpreadAmount,
        cx, cy + 3 * h + backSpreadAmount,
        cx - w, cy + 2 * h + backSpreadAmount);

      // Back-left face
      drawImageInParallelogram(backImg,
        cx - w + backLeftDx, cy - backSpreadAmount + backLeftDy,
        cx + backLeftDx, cy - h - backSpreadAmount + backLeftDy,
        cx + backLeftDx, cy - h - backSpreadAmount + s + backLeftDy,
        cx - w + backLeftDx, cy - backSpreadAmount + s + backLeftDy);

      // Back-right face
      drawImageInParallelogram(backImg,
        cx + w + backRightDx, cy - backSpreadAmount + backRightDy,
        cx + backRightDx, cy - h - backSpreadAmount + backRightDy,
        cx + backRightDx, cy - h - backSpreadAmount + s + backRightDy,
        cx + w + backRightDx, cy - backSpreadAmount + s + backRightDy);
    } else {
      // Fallback: solid fill when image not loaded
      drawBackFacePath(cx, cy + h + backSpreadAmount, cx + w, cy + 2 * h + backSpreadAmount, cx, cy + 3 * h + backSpreadAmount, cx - w, cy + 2 * h + backSpreadAmount);
      ctx.fillStyle = BLUE_BACK;
      ctx.fill();
      drawBackFacePath(cx - w + backLeftDx, cy - backSpreadAmount + backLeftDy, cx + backLeftDx, cy - h - backSpreadAmount + backLeftDy, cx + backLeftDx, cy - h - backSpreadAmount + s + backLeftDy, cx - w + backLeftDx, cy - backSpreadAmount + s + backLeftDy);
      ctx.fillStyle = BLUE_BACK;
      ctx.fill();
      drawBackFacePath(cx + w + backRightDx, cy - backSpreadAmount + backRightDy, cx + backRightDx, cy - h - backSpreadAmount + backRightDy, cx + backRightDx, cy - h - backSpreadAmount + s + backRightDy, cx + w + backRightDx, cy - backSpreadAmount + s + backRightDy);
      ctx.fillStyle = BLUE_BACK;
      ctx.fill();
    }
  }

  /** Returns a random permutation of [0, 1, 2] – no two faces get the same image. */
  function shuffleIndicesNoRepeat() {
    const arr = [0, 1, 2];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Updates front-face shuffle state. At random 2–3s intervals, cycles quickly through images
   * then randomly lands on one that stays until the next shuffle.
   */
  function updateFrontShuffle(now) {
    const st = shuffleState;
    if (st.phase === 'idle') {
      if (now >= st.nextShuffleAt) {
        st.phase = 'shuffling';
        st.shuffleStartTime = now;
        st.shuffleDuration = 800 + Math.random() * 400;  // 0.8–1.2s shuffle
        st.lastCycleTime = now;
      }
    } else {
      // Shuffling: cycle through permutations (no repeated index per face)
      if (now - st.lastCycleTime >= st.cycleIntervalMs) {
        st.lastCycleTime = now;
        frontDisplayIndices = shuffleIndicesNoRepeat();
      }
      if (now - st.shuffleStartTime >= st.shuffleDuration) {
        frontDisplayIndices = shuffleIndicesNoRepeat();
        st.phase = 'idle';
        st.nextShuffleAt = now + 6000 + Math.random() * 4000;  // 6–10s until next shuffle
      }
    }
  }

  /** Draws front faces (left, right, top) – rendered in front of the circle. */
  function drawFrontFaces(geom) {
    const { cx, cy, w, h, s, spreadAmount, leftDx, leftDy, rightDx, rightDy } = geom;

    // Left face – uses shuffled image from pool
    const leftImg = FRONT_FACE_POOL[frontDisplayIndices[0]];
    if (leftImg && leftImg.complete && leftImg.naturalWidth) {
      drawImageInParallelogram(leftImg,
        cx - w + leftDx, cy + leftDy,
        cx + leftDx, cy + h + leftDy,
        cx + leftDx, cy + h + s + leftDy,
        cx - w + leftDx, cy + s + leftDy);
    }

    // Right face
    const rightImg = FRONT_FACE_POOL[frontDisplayIndices[1]];
    if (rightImg && rightImg.complete && rightImg.naturalWidth) {
      drawImageInParallelogram(rightImg,
        cx + w + rightDx, cy + rightDy,
        cx + rightDx, cy + h + rightDy,
        cx + rightDx, cy + h + s + rightDy,
        cx + w + rightDx, cy + s + rightDy);
    }

    // Top face
    const topImg = FRONT_FACE_POOL[frontDisplayIndices[2]];
    if (topImg && topImg.complete && topImg.naturalWidth) {
      drawImageInParallelogram(topImg,
        cx, cy - h - spreadAmount,
        cx + w, cy - spreadAmount,
        cx, cy + h - spreadAmount,
        cx - w, cy - spreadAmount);
    }
  }

  function draw() {
    time += 0.01;
    updateFrontShuffle(perfNow());
    var W = cssWidth;
    var H = cssHeight;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);

    var cubeSize = Math.min(W, H) * 0.3;
    var targetSpread = 0;
    if (mouseX !== null && mouseY !== null) {
      var dist = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      var innerRadius = Math.min(W, H) * 0.12;
      var outerRadius = Math.min(W, H) * 0.28;
      var t = dist <= innerRadius ? 1 : dist >= outerRadius ? 0 : (outerRadius - dist) / (outerRadius - innerRadius);
      targetSpread = t * cubeSize * 0.4;
    }
    currentSpread = lerpEaseInOut(currentSpread, targetSpread, SMOOTH_SPEED, cubeSize * 0.5);

    var geom = computeCubeGeometry(0, -cubeSize / 2, cubeSize, currentSpread);

    // 1. Back faces (behind circle)
    ctx.globalAlpha = 0.9;
    drawBackFaces(geom);

    // 2. Circle: glass-lava HUD (lava lamp + animated rings)
    ctx.globalAlpha = 1;
    var circleR = Math.min(W, H) * 0.18;
    if (rings.length === 0) {
      rings = RING_CONFIGS.map(function (c) { return new Ring(c); });
    }
    if (blobs.length === 0) createBlobs();

    var scale = circleR / 280;
    drawLavaLamp(circleR);
    rings.forEach(function (ring) {
      ring.update();
      ring.draw(scale);
    });

    // 3. Front faces (in front of circle)
    ctx.globalAlpha = 0.9;
    drawFrontFaces(geom);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
