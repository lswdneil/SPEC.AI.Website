/* ============================================================
   1号员工官网 — 全站固定背景（Gateway Flow 双色双向变体）
   来源：verified source「Constellation Field」gateway-flow.html
   revision SHA-256 1920ad4fe34f（渲染器算法忠实保留，扩展为双色双向）
   技术：Canvas 2D，零外部依赖
   视觉：
     - 红褐粒子：左侧进 → 中间汇合点 → 右侧出（路径偏上带）
     - 信息蓝粒子：右侧进 → 中间汇合点 → 左侧出（路径偏下带）
     - 上下带错开，路径不重叠，仅在中心汇合点区域交汇
   品牌色：红褐 #c25b43/#e8a08c 主 + 信息蓝 #5b8def
   降级：prefers-reduced-motion → 静态一帧；visibilitychange 暂停；
        视口越小粒子越少；设备像素比适配
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  /* ---------- 品牌色（暗底） ---------- */
  var COLOR_LINE_LR = "rgba(194, 91, 67, 0.3)";          // 红褐流线（左→右）
  var COLOR_LINE_RL = "rgba(91, 141, 239, 0.3)";        // 信息蓝流线（右→左）
  var COLOR_PARTICLE_LR = "rgba(232, 160, 140, 0.85)";  // 浅红褐粒子
  var COLOR_PARTICLE_RL = "rgba(110, 158, 244, 0.8)";   // 信息蓝粒子（提亮）
  var COLOR_RING = "rgba(194, 91, 67, 0.22)";           // 涟漪环

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 路径数随视口自适应 ---------- */
  function pathCount() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    if (w < 768) return 36;
    if (w < 1280) return 56;
    return 80;
  }

  var width = 0, height = 0;
  var paths = [];
  var explosions = [];
  var rafId = null;

  /* ---------- 尺寸（高分屏适配） ---------- */
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPaths();
    if (reduced) drawFrame();
  }

  function buildPaths() {
    paths = [];
    var n = pathCount();
    var half = Math.ceil(n / 2);
    // 红褐（左→右）：起点分散在上带 [0.08h, 0.58h]，汇聚到中心后向上带扩散
    for (var i = 0; i < half; i++) {
      paths.push({
        dir: "lr",
        startY: 0.08 * height + (i / Math.max(1, half - 1)) * (0.5 * height),
        particles: [{ t: Math.random(), speed: 0.0015 + Math.random() * 0.002 }]
      });
    }
    // 信息蓝（右→左）：起点分散在下带 [0.42h, 0.92h]，汇聚到中心后向下带扩散
    for (var j = 0; j < n - half; j++) {
      paths.push({
        dir: "rl",
        startY: 0.42 * height + (j / Math.max(1, (n - half) - 1)) * (0.5 * height),
        particles: [{ t: Math.random(), speed: 0.0015 + Math.random() * 0.002 }]
      });
    }
  }

  /* ---------- 点击涟漪 ---------- */
  function onClick(e) {
    explosions.push({ x: e.clientX, y: e.clientY, radius: 0, life: 1 });
  }
  if (!reduced) {
    window.addEventListener("click", onClick);
    window.addEventListener("pointerdown", onClick); // 触屏支持
  }

  /* ---------- 贝塞尔插值（忠实于原实现） ---------- */
  function getBezierPoint(t, p0, p1, p2, p3) {
    var u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  }

  /* ---------- 控制点：汇聚→扩散 ----------
     lr（红褐）：左侧分散进 → 中心收敛（p2 拉向中线）→ 右上带重新散开出
     rl（蓝）：  右侧分散进 → 中心收敛 → 左下带重新散开出
     上下带错开，仅在中心汇合区交汇，路径整体不重叠 */
  function getControls(path) {
    var centerX = width / 2;
    var centerY = height / 2;
    var sy = path.startY;
    if (path.dir === "lr") {
      return [
        { x: 0, y: sy },
        { x: width * 0.26, y: sy },
        { x: width * 0.7, y: centerY },
        { x: width, y: centerY + (sy - centerY) * 0.7 }
      ];
    }
    // 右进 → 中 → 左出（镜像）
    return [
      { x: width, y: sy },
      { x: width * 0.74, y: sy },
      { x: width * 0.3, y: centerY },
      { x: 0, y: centerY + (sy - centerY) * 0.7 }
    ];
  }

  /* 中心附近减速（easeInOutQuad）：粒子流向中心时聚集，过中心后加速扩散 */
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function pathStyle(path) {
    return path.dir === "lr"
      ? { line: COLOR_LINE_LR, particle: COLOR_PARTICLE_LR }
      : { line: COLOR_LINE_RL, particle: COLOR_PARTICLE_RL };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    ctx.clearRect(0, 0, width, height);
    var centerX = width / 2;
    var centerY = height / 2;

    explosions.forEach(function (exp) {
      exp.radius += 15;
      exp.life -= 0.015;
    });
    explosions = explosions.filter(function (exp) { return exp.life > 0; });

    // 中心汇合点：双色混合光晕 + 呼吸亮点（让交汇肉眼可见）
    var pulse = 0.55 + 0.45 * Math.sin(Date.now() / 550);
    var grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 70);
    grad.addColorStop(0, "rgba(232, 160, 140, " + (0.3 * pulse).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(91, 141, 239, " + (0.22 * pulse).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(16, 18, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(centerX - 70, centerY - 70, 140, 140);
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232, 160, 140, 0.95)";
    ctx.fill();

    paths.forEach(function (path) {
      var pts = getControls(path);
      var style = pathStyle(path);

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
      ctx.strokeStyle = style.line;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([1, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      path.particles.forEach(function (p) {
        p.t += p.speed;
        if (p.t > 1) {
          p.t = 0;
          path.startY += (Math.random() - 0.5) * 10;
        }

        var pos = getBezierPoint(easeInOut(p.t), pts[0], pts[1], pts[2], pts[3]);

        var dxTotal = 0, dyTotal = 0;
        explosions.forEach(function (exp) {
          var dx = pos.x - exp.x;
          var dy = pos.y - exp.y;
          var dist = Math.hypot(dx, dy);
          if (dist < exp.radius + 120 && dist > exp.radius - 120) {
            var force = (1 - Math.abs(dist - exp.radius) / 120) * exp.life;
            dxTotal += (dx / dist) * force * 80;
            dyTotal += (dy / dist) * force * 80;
          }
        });
        pos.x += dxTotal;
        pos.y += dyTotal;

        // 粒子在中心汇合区（t 接近 0.5）时稍微放大，突出交汇
        var nearCenter = Math.abs(p.t - 0.5) < 0.12;
        var s = nearCenter ? 2.6 : 1.9;
        ctx.fillStyle = style.particle;
        ctx.fillRect(pos.x - s, pos.y - s, s * 2, s * 2);
      });
    });

    // 涟漪环
    explosions.forEach(function (exp) {
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.strokeStyle = COLOR_RING;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    rafId = requestAnimationFrame(render);
  }

  /* ---------- 静态一帧（reduced-motion） ---------- */
  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    paths.forEach(function (path) {
      var pts = getControls(path);
      var style = pathStyle(path);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
      ctx.strokeStyle = style.line;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([1, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      path.particles.forEach(function (p) {
        var pos = getBezierPoint(easeInOut(p.t), pts[0], pts[1], pts[2], pts[3]);
        ctx.fillStyle = style.particle;
        ctx.fillRect(pos.x - 1.9, pos.y - 1.9, 3.8, 3.8);
      });
    });
  }

  /* ---------- 生命周期：暂停/恢复 ---------- */
  function onVisibility() {
    if (document.hidden) {
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (!reduced && rafId == null) {
      render();
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  if (reduced) {
    drawFrame();
  } else {
    render();
  }
})();
