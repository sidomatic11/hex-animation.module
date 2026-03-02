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

  let mouseX = null;
  let mouseY = null;
  let currentSpread = 0;
  const SMOOTH_SPEED = 0.06;  // Lower = slower (0.04–0.1 typical)
  const BACK_SPREAD_FACTOR = 1.5;  // Back faces spread less than front (0–1)

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

  /** Draws front faces (left, right, top) – rendered in front of the circle. */
  function drawFrontFaces(geom) {
    const { cx, cy, w, h, s, spreadAmount, leftDx, leftDy, rightDx, rightDy } = geom;

    // Left face – image only (transparent when not loaded)
    if (FACE_IMAGES.left.complete && FACE_IMAGES.left.naturalWidth) {
      drawImageInParallelogram(FACE_IMAGES.left,
        cx - w + leftDx, cy + leftDy,
        cx + leftDx, cy + h + leftDy,
        cx + leftDx, cy + h + s + leftDy,
        cx - w + leftDx, cy + s + leftDy);
    }

    // Right face
    if (FACE_IMAGES.right.complete && FACE_IMAGES.right.naturalWidth) {
      drawImageInParallelogram(FACE_IMAGES.right,
        cx + w + rightDx, cy + rightDy,
        cx + rightDx, cy + h + rightDy,
        cx + rightDx, cy + h + s + rightDy,
        cx + w + rightDx, cy + s + rightDy);
    }

    // Top face
    if (FACE_IMAGES.top.complete && FACE_IMAGES.top.naturalWidth) {
      drawImageInParallelogram(FACE_IMAGES.top,
        cx, cy - h - spreadAmount,
        cx + w, cy - spreadAmount,
        cx, cy + h - spreadAmount,
        cx - w, cy - spreadAmount);
    }
  }

  function draw() {
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

    // 2. Circle (in the middle, opaque)
    ctx.globalAlpha = 1;
    var circleR = Math.min(W, H) * 0.18;
    ctx.beginPath();
    ctx.arc(0, 0, circleR, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();

    // 3. Front faces (in front of circle)
    ctx.globalAlpha = 0.9;
    drawFrontFaces(geom);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
