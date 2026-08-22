/* ============================================================
   1号员工官网 — 全站固定背景（Gateway Flow 变体）
   来源：verified source「Constellation Field」gateway-flow.html
   revision SHA-256 1920ad4fe34f（渲染器算法忠实保留，仅做品牌色与降级适配）
   技术：Canvas 2D，零外部依赖
   视觉：贝塞尔流线自两侧汇聚中心 + 流动粒子 + 点击涟漪
   品牌色：红褐 #c25b43 主 / 浅红褐 #e8a08c 粒子 / 信息蓝 #5b8def 点缀
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
  var COLOR_LINE = "rgba(194, 91, 67, 0.28)";        // 红褐流线
  var COLOR_PARTICLE = "rgba(232, 160, 140, 0.72)";  // 浅红褐粒子（aou-8，左侧）
  var COLOR_PARTICLE_ALT = "rgba(91, 141, 239, 0.55)"; // 信息蓝点缀（左侧保留）
  var COLOR_PARTICLE_RIGHT = "rgba(110, 158, 244, 0.8)"; // 信息蓝粒子（右侧）
  var COLOR_RING = "rgba(194, 91, 67, 0.22)";        // 涟漪环

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
  var running = false;

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
    for (var i = 0; i < n; i++) {
      // 每条流线 2 个粒子（粒子数量翻倍，流线结构不变）
      var particles = [];
      for (var k = 0; k < 2; k++) {
        particles.push({ t: Math.random(), speed: 0.0015 + Math.random() * 0.002 });
      }
      paths.push({
        isLeft: i % 2 === 0,
        startY: (i / n) * height * 1.4 - height * 0.2,
        particles: particles
      });
    }
  }

  /* ---------- 点击涟漪（忠实于原实现） ---------- */
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

    paths.forEach(function (path) {
      var p0 = { x: path.isLeft ? 0 : width, y: path.startY };
      var p1 = { x: path.isLeft ? centerX * 0.5 : width - centerX * 0.5, y: path.startY };
      var p2 = { x: path.isLeft ? centerX * 0.8 : width - centerX * 0.8, y: centerY };
      var p3 = { x: centerX, y: centerY };

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.strokeStyle = COLOR_LINE;
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

        var pos = getBezierPoint(p.t, p0, p1, p2, p3);

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

        // 粒子颜色：左侧路径保持红褐（含原信息蓝点缀），右侧路径改为信息蓝
        ctx.fillStyle = path.isLeft
          ? (Math.random() < 0.12 ? COLOR_PARTICLE_ALT : COLOR_PARTICLE)
          : COLOR_PARTICLE_RIGHT;
        ctx.fillRect(pos.x - 1.5, pos.y - 1.5, 3, 3);
      });
    });

    // 涟漪环（品牌色）
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
    var centerX = width / 2;
    var centerY = height / 2;
    paths.forEach(function (path) {
      var p0 = { x: path.isLeft ? 0 : width, y: path.startY };
      var p1 = { x: path.isLeft ? centerX * 0.5 : width - centerX * 0.5, y: path.startY };
      var p2 = { x: path.isLeft ? centerX * 0.8 : width - centerX * 0.8, y: centerY };
      var p3 = { x: centerX, y: centerY };
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.strokeStyle = COLOR_LINE;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([1, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      path.particles.forEach(function (p) {
        var pos = getBezierPoint(p.t, p0, p1, p2, p3);
        ctx.fillStyle = COLOR_PARTICLE;
        ctx.fillRect(pos.x - 1.5, pos.y - 1.5, 3, 3);
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
