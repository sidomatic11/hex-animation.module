(function () {
  const canvas = document.getElementById('hex-canvas');
  const ctx = canvas.getContext('2d');

  // Config
  const BG = '#080c24';
  const ORANGE = '#FF5B26';
  const BLUE_LEFT = '#1a4d8c';   // Darkest – left face (shadowed)
  const BLUE_RIGHT = '#2d7dd2';  // Lightest – right face (lit)
  const BLUE_TOP = '#2563b8';    // Mid – top face

  let mouseX = null;
  let mouseY = null;
  let currentSpread = 0;
  const SMOOTH_SPEED = 0.06;  // Lower = slower (0.04–0.1 typical)

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

  function drawIsometricCube(cx, cy, size, spread) {
    const s = size;
    const w = s * ISO_X;  // Horizontal extent per unit (cos 30°)
    const h = s * ISO_Y;  // Vertical extent per unit (sin 30°)
    const spreadAmount = spread || 0;

    // Draw order: back faces first so top overlaps correctly
    // Left face: parallelogram (darker); pushed left when spread > 0
    ctx.beginPath();
    ctx.moveTo(cx - w - spreadAmount, cy);
    ctx.lineTo(cx - spreadAmount, cy + h);
    ctx.lineTo(cx - spreadAmount, cy + h + s);
    ctx.lineTo(cx - w - spreadAmount, cy + s);
    ctx.closePath();
    ctx.fillStyle = BLUE_LEFT;
    ctx.fill();

    // Right face: parallelogram (lighter); pushed right when spread > 0
    ctx.beginPath();
    ctx.moveTo(cx + w + spreadAmount, cy);
    ctx.lineTo(cx + spreadAmount, cy + h);
    ctx.lineTo(cx + spreadAmount, cy + h + s);
    ctx.lineTo(cx + w + spreadAmount, cy + s);
    ctx.closePath();
    ctx.fillStyle = BLUE_RIGHT;
    ctx.fill();

    // Top face: diamond; pushed up when spread > 0
    ctx.beginPath();
    ctx.moveTo(cx, cy - h - spreadAmount);       // top
    ctx.lineTo(cx + w, cy - spreadAmount);        // right
    ctx.lineTo(cx, cy + h - spreadAmount);        // bottom
    ctx.lineTo(cx - w, cy - spreadAmount);       // left
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

    // Circle behind the cube
    var circleR = Math.min(W, H) * 0.18;
    ctx.beginPath();
    ctx.arc(0, 0, circleR, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();

    // Cube in front, semi-transparent (larger than circle)
    ctx.globalAlpha = 0.8;
    var cubeSize = Math.min(W, H) * 0.3;
    // Offset up so cube's geometric center aligns with origin
    var targetSpread = 0;
    if (mouseX !== null && mouseY !== null) {
      var dist = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
      var innerRadius = Math.min(W, H) * 0.12;   // Max spread when within this
      var outerRadius = Math.min(W, H) * 0.28;   // Zero spread when beyond this
      var t = dist <= innerRadius ? 1 : dist >= outerRadius ? 0 : (outerRadius - dist) / (outerRadius - innerRadius);
      targetSpread = t * cubeSize * 0.4;
    }
    currentSpread = lerpEaseInOut(currentSpread, targetSpread, SMOOTH_SPEED, cubeSize * 0.5);
    drawIsometricCube(0, -cubeSize / 2, cubeSize, currentSpread);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
