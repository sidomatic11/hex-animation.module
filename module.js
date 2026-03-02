(function () {
  const canvas = document.getElementById('hex-canvas');
  const ctx = canvas.getContext('2d');

  // Config
  const BG = '#080c24';
  const ORANGE = '#FF5B26';
  const BLUE_LEFT = '#1a4d8c';   // Darkest – left face (shadowed)
  const BLUE_RIGHT = '#2d7dd2';  // Lightest – right face (lit)
  const BLUE_TOP = '#2563b8';    // Mid – top face

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

  function drawIsometricCube(cx, cy, size) {
    const s = size;
    const w = s * ISO_X;  // Horizontal extent per unit (cos 30°)
    const h = s * ISO_Y;  // Vertical extent per unit (sin 30°)

    // Draw order: back faces first so top overlaps correctly
    // Left face: parallelogram (darker); shares top edge with diamond
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx, cy + h + s);
    ctx.lineTo(cx - w, cy + s);
    ctx.closePath();
    ctx.fillStyle = BLUE_LEFT;
    ctx.fill();

    // Right face: parallelogram (lighter); shares top edge with diamond
    ctx.beginPath();
    ctx.moveTo(cx + w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx, cy + h + s);
    ctx.lineTo(cx + w, cy + s);
    ctx.closePath();
    ctx.fillStyle = BLUE_RIGHT;
    ctx.fill();

    // Top face: diamond (4 vertices, centered)
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);       // top
    ctx.lineTo(cx + w, cy);       // right
    ctx.lineTo(cx, cy + h);       // bottom
    ctx.lineTo(cx - w, cy);       // left
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
    drawIsometricCube(0, -cubeSize / 2, cubeSize);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
