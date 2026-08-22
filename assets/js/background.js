/* ============================================================
   1号员工官网 — 全站固定背景（Gateway Flow 固定点汇聚-扩散）
   来源：verified source「Constellation Field」gateway-flow.html
   revision SHA-256 1920ad4fe34f（渲染器算法忠实保留，重构为固定点两段式）
   技术：Canvas 2D，零外部依赖
   中心思想：
     - 粒子从两侧边缘分散位置出发，汇聚到屏幕中央【同一固定点】
     - 到点后，沿对侧方向从固定点向边缘重新扩散
     - 红褐：左侧 → 固定点 → 右侧；信息蓝：右侧 → 固定点 → 左侧
     - 上下带错开，路径不重叠；固定点处两色粒子交汇
   品牌色：红褐 #c25b43/#e8a08c + 信息蓝 #5b8def
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
  var COLOR_LINE_LR = "rgba(194, 91, 67, 0.3)";          // 红褐流线（左→固定点→右）
  var COLOR_LINE_RL = "rgba(91, 141, 239, 0.3)";        // 信息蓝流线（右→固定点→左）
  var COLOR_PARTICLE_LR = "rgba(232, 160, 140, 0.85)";  // 浅红褐粒子
  var COLOR_PARTICLE_RL = "rgba(110, 158, 244, 0.8)";   // 信息蓝粒子
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
    // 红褐（左→固定点→右）：起点/终点均分布在上带 [0.08h, 0.58h]
    for (var i = 0; i < half; i++) {
      paths.push({
        dir: "lr",
        startY: 0.08 * height + (i / Math.max(1, half - 1)) * (0.5 * height),
        endY: 0.08 * height + (i / Math.max(1, half - 1)) * (0.5 * height),
        particles: [{ t: Math.random(), speed: 0.0015 + Math.random() * 0.002 }]
      });
    }
    // 信息蓝（右→固定点→左）：起点/终点均分布在下带 [0.42h, 0.92h]
    for (var j = 0; j < n - half; j++) {
      paths.push({
        dir: "rl",
        startY: 0.42 * height + (j / Math.max(1, (n - half) - 1)) * (0.5 * height),
        endY: 0.42 * height + (j / Math.max(1, (n - half) - 1)) * (0.5 * height),
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

  /* ---------- 缓动：两段在固定点处均减速（停驻感） ---------- */
  function easeInOut(k) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  }

  function lerp(a, b, k) {
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  /* ---------- 固定点（屏幕中央同一坐标） ---------- */
  function hub() {
    return { x: width / 2, y: height / 2 };
  }

  /* ---------- 粒子两段式位置：边缘 → 固定点 → 对侧边缘 ---------- */
  function getPos(path, t) {
    var h = hub();
    var edge0 = { x: path.dir === "lr" ? 0 : width, y: path.startY };
    var edge1 = { x: path.dir === "lr" ? width : 0, y: path.endY };
    if (t <= 0.5) {
      // 汇聚段：边缘 → 固定点（到达时减速停驻）
      return lerp(edge0, h, easeInOut(t * 2));
    }
    // 扩散段：固定点 → 对侧边缘（离开时先慢后快）
    return lerp(h, edge1, easeInOut((t - 0.5) * 2));
  }

  function pathStyle(path) {
    return path.dir === "lr"
      ? { line: COLOR_LINE_LR, particle: COLOR_PARTICLE_LR }
      : { line: COLOR_LINE_RL, particle: COLOR_PARTICLE_RL };
  }

  /* ---------- 绘制一条路径的两段流线（边缘↔固定点） ---------- */
  function drawRoute(path) {
    var h = hub();
    var p0 = { x: path.dir === "lr" ? 0 : width, y: path.startY };
    var p3 = { x: path.dir === "lr" ? width : 0, y: path.endY };
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(h.x, h.y);
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.strokeStyle = pathStyle(path).line;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    ctx.clearRect(0, 0, width, height);
    var h = hub();

    explosions.forEach(function (exp) {
      exp.radius += 15;
      exp.life -= 0.015;
    });
    explosions = explosions.filter(function (exp) { return exp.life > 0; });

    // 固定汇合点：双色混合光晕 + 亮点（粒子汇聚的落点）
    var pulse = 0.55 + 0.45 * Math.sin(Date.now() / 550);
    var grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 70);
    grad.addColorStop(0, "rgba(232, 160, 140, " + (0.35 * pulse).toFixed(3) + ")");
    grad.addColorStop(0.45, "rgba(91, 141, 239, " + (0.25 * pulse).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(16, 18, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(h.x - 70, h.y - 70, 140, 140);
    ctx.beginPath();
    ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232, 160, 140, 0.95)";
    ctx.fill();

    // 流线（先画，粒子叠上）
    paths.forEach(drawRoute);

    paths.forEach(function (path) {
      var style = pathStyle(path);
      path.particles.forEach(function (p) {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;

        var pos = getPos(path, p.t);

        // 点击涟漪扰动
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

        // 粒子在固定点附近稍大，突出汇聚
        var nearHub = Math.abs(p.t - 0.5) < 0.1;
        var s = nearHub ? 2.6 : 1.9;
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
    var h = hub();
    var grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 70);
    grad.addColorStop(0, "rgba(232, 160, 140, 0.3)");
    grad.addColorStop(0.45, "rgba(91, 141, 239, 0.22)");
    grad.addColorStop(1, "rgba(16, 18, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(h.x - 70, h.y - 70, 140, 140);

    paths.forEach(drawRoute);
    paths.forEach(function (path) {
      var style = pathStyle(path);
      path.particles.forEach(function (p) {
        var pos = getPos(path, p.t);
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
