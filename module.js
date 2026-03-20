(function () {
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d');

  // Interaction model:
  // - Desktop/hover devices: mousemove drives cube spread.
  // - Touch/no-hover devices: no mouse-driven expansion; we run periodic "pulse" expansion.

  // Config
  const BG = '#070129';
  const BLUE_BACK = '#1a3a5c';

  // Back face images (loaded async)
  const backBottomImage = new Image();
  backBottomImage.src = 'hero-animation-back-bottom.svg';
  const backLeftImage = new Image();
  backLeftImage.src = 'hero-animation-back-left.svg';
  const backRightImage = new Image();
  backRightImage.src = 'hero-animation-back-right.svg';

  const FRONT_FACE_POOL = [];
  for (let i = 1; i <= 6; i++) {
    const img = new Image();
    const indexStr = String(i).padStart(2, '0');
    img.src = 'hero-animation-front-' + indexStr + '.svg';
    FRONT_FACE_POOL.push(img);
  }
  let frontDisplayIndices = [0, 1, 2];
  const perfNow = typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now;
  const isHoverCapable = !!(window.matchMedia &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  let shuffleState = {
    phase: 'idle',
    nextShuffleAt: perfNow() + 4000 + Math.random() * 1000,
    shuffleStartTime: 0,
    shuffleDuration: 0,
    lastCycleTime: 0,
    // Higher = fewer image changes per shuffle (slower / calmer).
    cycleIntervalMs: 400
  };

  let mouseX = null;
  let mouseY = null;
  let currentSpread = 0;
  // Lower = slower cube expansion/contraction response.
  const SMOOTH_SPEED = 0.035;
  const BACK_SPREAD_FACTOR = 1.5;

  // Touch/no-hover pulse animation (no user input required).
  const TOUCH_PULSE_INTERVAL_MS = 5600; // regular interval between pulses
  // Pulse phases: expand -> HOLD at max -> close.
  // Requirement: hold expanded state for ~1 second before closing.
  const TOUCH_PULSE_RAMP_UP_MS = 380;
  const TOUCH_PULSE_HOLD_MS = 2000;
  const TOUCH_PULSE_RAMP_DOWN_MS = 520;
  // Increase for "more expansion" on touch and hover.
  const TOUCH_PULSE_MAX_FACTOR = 0.4;   // matches hover's max spread scaling
  let touchPulseStartAt = null; // perfNow timestamp
  let touchPulseRampUpMs = TOUCH_PULSE_RAMP_UP_MS;
  let touchPulseRampDownMs = TOUCH_PULSE_RAMP_DOWN_MS;
  let touchPulseDurationMs = TOUCH_PULSE_RAMP_UP_MS + TOUCH_PULSE_HOLD_MS + TOUCH_PULSE_RAMP_DOWN_MS;
  let nextTouchPulseAt = perfNow() + 1200 + Math.random() * 1200;

  let time = 0;
  let hudRings = [];
  let orbWisps = [];
  const HUD_RING_CONFIGS = [
    { radius: 60, baseSpeed: 0.003, thickness: 90, dash: [180, 90], color: 'rgba(255, 255, 255, 0.14)' },
    { radius: 105, baseSpeed: -0.002, thickness: 120, dash: [300, 120], color: 'rgba(255, 236, 179, 0.1)' },
    { radius: 205, baseSpeed: -0.0025, thickness: 120, dash: [550, 180], color: 'rgba(255, 255, 255, 0.07)' }
  ];

  if (isHoverCapable) {
    canvas.addEventListener('mousemove', function (e) {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) - rect.width / 2;
      mouseY = (e.clientY - rect.top) - rect.height / 2;
    });
    canvas.addEventListener('mouseleave', function () {
      mouseX = null;
      mouseY = null;
    });
  }

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

  const ISO_X = Math.cos(Math.PI / 6);
  const ISO_Y = Math.sin(Math.PI / 6);

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
   * Like drawImageInParallelogram but horizontally flipped within the same parallelogram.
   */
  function drawImageInParallelogramFlippedX(img, x0, y0, x1, y1, x2, y2, x3, y3) {
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.transform(-(x1 - x0), -(y1 - y0), x3 - x0, y3 - y0, 0, 0);
    ctx.beginPath();
    ctx.rect(-1, 0, 1, 1);
    ctx.clip();
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, -1, 0, 1, 1);
    ctx.restore();
  }

  /** Lerps `current` toward `target` with ease-in-out. */
  function lerpEaseInOut(current, target, speed, maxDelta) {
    var delta = target - current;
    var range = maxDelta != null ? maxDelta : Math.max(1, Math.abs(target));
    var normalizedDist = Math.min(1, Math.abs(delta) / range);
    var easeInOut = normalizedDist * (1 - normalizedDist) * 4;
    return current + delta * speed * (0.85 + easeInOut * 0.15);
  }

  /** Computes shared isometric cube geometry. */
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

  /** Dashed concentric ring; values scaled at draw time. */
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

  function initOrbWisps() {
    orbWisps = [];
    for (let i = 0; i < 3; i++) {
      orbWisps.push({
        size: 220 + Math.random() * 200,
        angle: Math.random() * Math.PI * 2,
        dist: 40 + Math.random() * 100,
        speed: 0.003 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  /** Draws the orb core gradient with animated wisps. */
  function drawOrbCore(bgRadius) {
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

    orbWisps.forEach(function (wisp) {
      wisp.angle += wisp.speed;
      const movement = Math.sin(time * 0.5 + wisp.phase) * 40 * scale;
      const bx = Math.cos(wisp.angle) * (wisp.dist * scale + movement);
      const by = Math.sin(wisp.angle * 0.7) * (wisp.dist * scale + movement);
      const size = wisp.size * scale;
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

    function drawBackFacePath(x0, y0, x1, y1, x2, y2, x3, y3) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
    }

    function drawQuadFill(quad) {
      ctx.fillStyle = BLUE_BACK;
      drawBackFacePath(
        quad[0].x, quad[0].y,
        quad[1].x, quad[1].y,
        quad[2].x, quad[2].y,
        quad[3].x, quad[3].y
      );
      ctx.fill();
    }

    const hasBottom = backBottomImage.complete && backBottomImage.naturalWidth;
    const hasLeft = backLeftImage.complete && backLeftImage.naturalWidth;
    const hasRight = backRightImage.complete && backRightImage.naturalWidth;
    const hasAny = hasBottom || hasLeft || hasRight;

    const bottomQuad = [
      { x: cx, y: cy + h + backSpreadAmount },
      { x: cx + w, y: cy + 2 * h + backSpreadAmount },
      { x: cx, y: cy + 3 * h + backSpreadAmount },
      { x: cx - w, y: cy + 2 * h + backSpreadAmount }
    ];
    const backLeftQuad = [
      { x: cx - w + backLeftDx, y: cy - backSpreadAmount + backLeftDy },
      { x: cx + backLeftDx, y: cy - h - backSpreadAmount + backLeftDy },
      { x: cx + backLeftDx, y: cy - h - backSpreadAmount + s + backLeftDy },
      { x: cx - w + backLeftDx, y: cy - backSpreadAmount + s + backLeftDy }
    ];
    const backRightQuad = [
      { x: cx + w + backRightDx, y: cy - backSpreadAmount + backRightDy },
      { x: cx + backRightDx, y: cy - h - backSpreadAmount + backRightDy },
      { x: cx + backRightDx, y: cy - h - backSpreadAmount + s + backRightDy },
      { x: cx + w + backRightDx, y: cy - backSpreadAmount + s + backRightDy }
    ];

    if (hasAny) {
      ctx.save();
      ctx.globalAlpha = 0.2;
    }

    if (hasBottom) {
      drawImageInParallelogram(
        backBottomImage,
        bottomQuad[3].x, bottomQuad[3].y,
        bottomQuad[0].x, bottomQuad[0].y,
        bottomQuad[1].x, bottomQuad[1].y,
        bottomQuad[2].x, bottomQuad[2].y
      );
    } else {
      drawQuadFill(bottomQuad);
    }

    // Back-left face
    if (hasLeft) {
      drawImageInParallelogram(
        backLeftImage,
        backLeftQuad[0].x, backLeftQuad[0].y,
        backLeftQuad[1].x, backLeftQuad[1].y,
        backLeftQuad[2].x, backLeftQuad[2].y,
        backLeftQuad[3].x, backLeftQuad[3].y
      );
    } else {
      drawQuadFill(backLeftQuad);
    }

    // Back-right face (flipped X)
    if (hasRight) {
      drawImageInParallelogramFlippedX(
        backRightImage,
        backRightQuad[0].x, backRightQuad[0].y,
        backRightQuad[1].x, backRightQuad[1].y,
        backRightQuad[2].x, backRightQuad[2].y,
        backRightQuad[3].x, backRightQuad[3].y
      );
    } else {
      drawQuadFill(backRightQuad);
    }

    if (hasAny) ctx.restore();
  }

  /** Returns 3 unique random indices into FRONT_FACE_POOL – no two faces get the same image. */
  function shuffleIndicesNoRepeat() {
    const n = FRONT_FACE_POOL.length;
    const indices = [];
    for (let i = 0; i < n; i++) indices.push(i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, 3);
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
        // Duration = 4 cycles so end aligns with cycle boundary (smooth landing).
        st.shuffleDuration = 5 * st.cycleIntervalMs;
        st.lastCycleTime = now;
      }
    } else {
      if (now - st.lastCycleTime >= st.cycleIntervalMs) {
        st.lastCycleTime = now;
        frontDisplayIndices = shuffleIndicesNoRepeat();
      }
      if (now - st.shuffleStartTime >= st.shuffleDuration) {
        // Freeze on last cycled set (already unique); no extra shuffle for smooth landing.
        st.phase = 'idle';
        st.nextShuffleAt = now + 6000 + Math.random() * 4000;  // 6–10s until next shuffle
      }
    }
  }

  /** Draws front faces (left, right, top) – rendered in front of the circle. */
  function drawFrontFaces(geom) {
    const { cx, cy, w, h, s, spreadAmount, leftDx, leftDy, rightDx, rightDy } = geom;

    // Left face
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
    // Slower temporal progression = calmer ring/orb motion.
    time += 0.0075;
    const now = perfNow();
    updateFrontShuffle(now);
    var W = cssWidth;
    var H = cssHeight;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);

    var cubeSize = Math.min(W, H) * 0.3;
    var targetSpread = 0;
    if (isHoverCapable) {
      // Hover devices: spread follows pointer distance from center while pointer is present.
      if (mouseX !== null && mouseY !== null) {
        var dist = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
        var innerRadius = Math.min(W, H) * 0.12;
        var outerRadius = Math.min(W, H) * 0.28;
        var t = dist <= innerRadius ? 1 : dist >= outerRadius ? 0 : (outerRadius - dist) / (outerRadius - innerRadius);
        targetSpread = t * cubeSize * TOUCH_PULSE_MAX_FACTOR;
      } else {
        // Pointer not currently over the canvas: relax back to neutral.
        targetSpread = 0;
      }
    } else {
      // Touch/no-hover devices: run periodic pulses instead of user-controlled hover spread.
      if (touchPulseStartAt === null && now >= nextTouchPulseAt) {
        touchPulseStartAt = now;
        // Add a tiny variation to ramp timings, but keep the HOLD fixed at 1s.
        const rampVariation = 0.85 + Math.random() * 0.3;
        touchPulseRampUpMs = TOUCH_PULSE_RAMP_UP_MS * rampVariation;
        touchPulseRampDownMs = TOUCH_PULSE_RAMP_DOWN_MS * rampVariation;
        touchPulseDurationMs = touchPulseRampUpMs + TOUCH_PULSE_HOLD_MS + touchPulseRampDownMs;
      }
      if (touchPulseStartAt !== null) {
        var elapsed = now - touchPulseStartAt;
        if (elapsed >= touchPulseDurationMs) {
          touchPulseStartAt = null;
          nextTouchPulseAt = now + TOUCH_PULSE_INTERVAL_MS + Math.random() * 800;
        } else {
          // Envelope: expand (0->1), hold (1 for 1s), close (1->0).
          var envelope = 0;
          if (elapsed < touchPulseRampUpMs) {
            var tUp = touchPulseRampUpMs === 0 ? 1 : (elapsed / touchPulseRampUpMs); // 0..1
            // Ease-out-ish: slow start, faster near the end.
            envelope = Math.sin((Math.PI / 2) * tUp);
          } else if (elapsed < touchPulseRampUpMs + TOUCH_PULSE_HOLD_MS) {
            envelope = 1;
          } else {
            var downElapsed = elapsed - (touchPulseRampUpMs + TOUCH_PULSE_HOLD_MS);
            var tDown = touchPulseRampDownMs === 0 ? 1 : (downElapsed / touchPulseRampDownMs); // 0..1
            // Ease-out closing: 1 -> 0.
            envelope = Math.cos((Math.PI / 2) * tDown);
          }
          targetSpread = envelope * cubeSize * TOUCH_PULSE_MAX_FACTOR;
        }
      }
    }
    currentSpread = lerpEaseInOut(currentSpread, targetSpread, SMOOTH_SPEED, cubeSize * 0.5);

    var geom = computeCubeGeometry(0, -cubeSize / 2, cubeSize, currentSpread);

    // Back faces
    ctx.globalAlpha = 0.9;
    drawBackFaces(geom);

    // Orb core and rings
    ctx.globalAlpha = 1;
    var circleR = Math.min(W, H) * 0.18;
    if (hudRings.length === 0) {
      hudRings = HUD_RING_CONFIGS.map(function (c) { return new Ring(c); });
    }
    if (orbWisps.length === 0) initOrbWisps();

    var scale = circleR / 280;
    drawOrbCore(circleR);
    hudRings.forEach(function (ring) {
      ring.update();
      ring.draw(scale);
    });

    // Front faces
    ctx.globalAlpha = 0.9;
    drawFrontFaces(geom);
    ctx.globalAlpha = 1;

    ctx.restore();

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
