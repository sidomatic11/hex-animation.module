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

  let mouseX = null;
  let mouseY = null;
  let currentSpread = 0;
  const SMOOTH_SPEED = 0.06;  // Lower = slower (0.04–0.1 typical)
  const BACK_SPREAD_FACTOR = 1.5;  // Back faces spread less than front (0–1)

  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX - canvas.width / 2;
    mouseY = (e.clientY - rect.top) * scaleY - canvas.height / 2;
  });
  canvas.addEventListener('mouseleave', function () {
    mouseX = null;
    mouseY = null;
  });

  // Match canvas size to wrapper
  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Isometric projection: 30° horizontal axes, Y-down screen coords
  const ISO_X = Math.cos(Math.PI / 6);  // cos(30°) ≈ 0.866
  const ISO_Y = Math.sin(Math.PI / 6);  // sin(30°) ≈ 0.5

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

    // Bottom face (uses reduced back spread)
    ctx.beginPath();
    ctx.moveTo(cx, cy + h + backSpreadAmount);
    ctx.lineTo(cx + w, cy + 2 * h + backSpreadAmount);
    ctx.lineTo(cx, cy + 3 * h + backSpreadAmount);
    ctx.lineTo(cx - w, cy + 2 * h + backSpreadAmount);
    ctx.closePath();
    ctx.fillStyle = BLUE_BACK;
    ctx.fill();

    // Back-left face
    ctx.beginPath();
    ctx.moveTo(cx - w + backLeftDx, cy - backSpreadAmount + backLeftDy);
    ctx.lineTo(cx + backLeftDx, cy - h - backSpreadAmount + backLeftDy);
    ctx.lineTo(cx + backLeftDx, cy - h - backSpreadAmount + s + backLeftDy);
    ctx.lineTo(cx - w + backLeftDx, cy - backSpreadAmount + s + backLeftDy);
    ctx.closePath();
    ctx.fillStyle = BLUE_BACK;
    ctx.fill();

    // Back-right face
    ctx.beginPath();
    ctx.moveTo(cx + w + backRightDx, cy - backSpreadAmount + backRightDy);
    ctx.lineTo(cx + backRightDx, cy - h - backSpreadAmount + backRightDy);
    ctx.lineTo(cx + backRightDx, cy - h - backSpreadAmount + s + backRightDy);
    ctx.lineTo(cx + w + backRightDx, cy - backSpreadAmount + s + backRightDy);
    ctx.closePath();
    ctx.fillStyle = BLUE_BACK;
    ctx.fill();
  }

  /** Draws front faces (left, right, top) – rendered in front of the circle. */
  function drawFrontFaces(geom) {
    const { cx, cy, w, h, s, spreadAmount, leftDx, leftDy, rightDx, rightDy } = geom;

    // Left face
    ctx.beginPath();
    ctx.moveTo(cx - w + leftDx, cy + leftDy);
    ctx.lineTo(cx + leftDx, cy + h + leftDy);
    ctx.lineTo(cx + leftDx, cy + h + s + leftDy);
    ctx.lineTo(cx - w + leftDx, cy + s + leftDy);
    ctx.closePath();
    ctx.fillStyle = BLUE_LEFT;
    ctx.fill();

    // Right face
    ctx.beginPath();
    ctx.moveTo(cx + w + rightDx, cy + rightDy);
    ctx.lineTo(cx + rightDx, cy + h + rightDy);
    ctx.lineTo(cx + rightDx, cy + h + s + rightDy);
    ctx.lineTo(cx + w + rightDx, cy + s + rightDy);
    ctx.closePath();
    ctx.fillStyle = BLUE_RIGHT;
    ctx.fill();

    // Top face
    ctx.beginPath();
    ctx.moveTo(cx, cy - h - spreadAmount);
    ctx.lineTo(cx + w, cy - spreadAmount);
    ctx.lineTo(cx, cy + h - spreadAmount);
    ctx.lineTo(cx - w, cy - spreadAmount);
    ctx.closePath();
    ctx.fillStyle = BLUE_TOP;
    ctx.fill();
  }

  function draw() {
    var W = canvas.width;
    var H = canvas.height;

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
    ctx.globalAlpha = 0.8;
    drawBackFaces(geom);

    // 2. Circle (in the middle, opaque)
    ctx.globalAlpha = 1;
    var circleR = Math.min(W, H) * 0.18;
    ctx.beginPath();
    ctx.arc(0, 0, circleR, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();

    // 3. Front faces (in front of circle)
    ctx.globalAlpha = 0.8;
    drawFrontFaces(geom);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
