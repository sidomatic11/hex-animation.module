(function () {
  const canvas = document.getElementById('hex-canvas');
  const ctx = canvas.getContext('2d');

  const BG = '#080c24';
  const ORANGE = '#FF5B26';
  const BLUE = '#4A9FD4';
  const LOOP_DUR = 3000;
  const SENSITIVITY = 18;
  const HEX_COUNT = 3;
  const HEX_GAP = 18;
  const EASE_POW = 1.8;

  let mouseX = 0.5, mouseY = 0.5;
  let smoothX = 0.5, smoothY = 0.5;

  window.addEventListener('mousemove', function (e) {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
  });

  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function hexPath(cx, cy, r, rotation) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var angle = (Math.PI / 3) * i + rotation;
      var x = cx + r * Math.cos(angle);
      var y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function easeInOut(t) {
    return t < 0.5
      ? Math.pow(2 * t, EASE_POW) / 2
      : 1 - Math.pow(2 * (1 - t), EASE_POW) / 2;
  }

  function draw(ts) {
    var W = canvas.width;
    var H = canvas.height;

    smoothX += (mouseX - smoothX) * 0.06;
    smoothY += (mouseY - smoothY) * 0.06;
    var mx = smoothX - 0.5;
    var my = smoothY - 0.5;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    var cx = W / 2 + mx * SENSITIVITY;
    var cy = H / 2 + my * (SENSITIVITY * 0.75);
    var circleR = Math.min(W, H) * 0.18;

    var t = (ts % LOOP_DUR) / LOOP_DUR;
    var et = easeInOut(t);

    var minHexR = circleR + 10;
    var maxHexR = Math.min(W, H) * 0.48;

    var hexOpacity;
    if (t < 0.12) hexOpacity = t / 0.12;
    else if (t > 0.88) hexOpacity = (1 - t) / 0.12;
    else hexOpacity = 1;

    for (var i = HEX_COUNT - 1; i >= 0; i--) {
      var baseR = minHexR + (maxHexR - minHexR) * et;
      var r = baseR - i * HEX_GAP;
      if (r <= 0) continue;

      var hx = W / 2 + mx * (SENSITIVITY * 0.33 + i * 2);
      var hy = H / 2 + my * (SENSITIVITY * 0.25 + i * 2);

      ctx.globalAlpha = hexOpacity * (0.55 + i * 0.2);
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 1.5;
      hexPath(hx, hy, r, Math.PI / 6);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();