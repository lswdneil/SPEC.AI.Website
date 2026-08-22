/* ============================================================
   1号员工 — 官网交互脚本
   功能：读取 data/releases.json 动态渲染版本号与下载按钮
        平台自动识别（Windows / macOS / Linux）
        校验值复制、滚动显现、导航栏状态、场景 Tab
   ============================================================ */
(function () {
  "use strict";

  var DATA_URL = "data/releases.json";
  var state = { data: null, os: detectOS(), copiedTimer: null };

  /* ---------- 平台识别 ---------- */
  function detectOS() {
    var ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "windows";
    if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Linux/i.test(ua)) return "linux";
    return "windows";
  }

  /* ---------- 加载数据 ---------- */
  function loadData(cb) {
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) { state.data = d; cb(d); })
      .catch(function (e) {
        console.error("无法加载 releases.json：", e);
        // 离线兜底：显示占位文本，避免页面白屏
        document.querySelectorAll("[data-version]").forEach(function (el) {
          el.textContent = "未知版本";
        });
        document.querySelectorAll("[data-dl]").forEach(function (el) {
          el.setAttribute("disabled", "disabled");
          el.textContent = "下载配置缺失";
        });
      });
  }

  /* ---------- 元素工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 平台图标 ---------- */
  var OS_ICONS = {
    windows: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5 10.6 4.4v7.2H3V5.5Zm0 13 7.6 1.1v-7.3H3v6.2Zm8.6 1.3L21 21V12.4h-9.4v7.4Zm0-15.6v7.4H21V3l-9.4 1.2Z"/></svg>',
    macos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.3 12.7c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.9-2.1-1.7-.2-3.3 1-4.1 1-.8 0-2.1-1-3.5-1-1.8 0-3.4 1-4.3 2.7-1.9 3.2-.5 8 1.3 10.6.9 1.3 2 2.8 3.4 2.7 1.4 0 1.9-.9 3.6-.9 1.7 0 2 .9 3.6-.9 1.4-1.9 1.9-3.8 1.9-3.9-.1 0-3.7-1.5-3.7-5Z"/><path d="M14.7 4.6c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3-1.5Z"/></svg>',
    linux: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c-1.7 0-3 1.3-3 3 0 .5.1.9.3 1.3L6.4 10.7c-.4.4-.6.9-.6 1.5v5.4c0 1 .8 1.8 1.8 1.8h.9l.9 2.2c.2.6.8 1 1.4 1h2.4c.6 0 1.2-.4 1.4-1l.9-2.2h.9c1 0 1.8-.8 1.8-1.8v-5.4c0-.6-.2-1.1-.6-1.5l-2.9-3.4c.2-.4.3-.8.3-1.3 0-1.7-1.3-3-3-3Zm0 2c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1Zm-3 6.7 2.6-3.1c.4.2.9.4 1.4.4s1-.2 1.4-.4l2.6 3.1c.1.1.2.2.2.3v5.4H9v-5.4c0-.1.1-.2.2-.3Z"/></svg>'
  };

  /* ---------- 渲染：hero 下载按钮 ---------- */
  function renderHero(container, d) {
    if (!container) return;
    var map = { windows: "windows", macos: "macos", linux: "linux" };
    var key = map[state.os] || "windows";
    var p = d.platforms[key];

    if (p && p.primary) {
      var btn = el("a", "btn btn-primary", "");
      btn.href = p.primary.url;
      btn.setAttribute("download", "");
      btn.innerHTML = OS_ICONS[key] +
        "<span>下载 " + d.product.name + " for " + p.label.split(" ")[0] + "</span>" +
        '<span class="arrow" aria-hidden="true">→</span>';
      container.appendChild(btn);
    }
  }

  /* ---------- 渲染：能力特性（Bento 不对称网格） ---------- */
  function renderCapabilities(container, d) {
    if (!container || !d.capabilities) return;
    d.capabilities.forEach(function (c, i) {
      var cls = "cap-item reveal";
      // Bento 布局：前 2 项大块(6)、中间 3 项小块(4)、最后 1 项横条(12)
      if (i >= 2 && i < 5) cls += " cap-sm";
      if (i === 5) cls += " cap-wide";

      var item = el("div", cls);
      if (c.tag) item.appendChild(el("span", "cap-tag", c.tag));
      item.appendChild(el("h3", null, c.title));
      item.appendChild(el("p", null, c.desc));
      container.appendChild(item);
    });
  }

  /* ---------- 渲染：下载页平台卡片 ---------- */
  function renderDlGrid(grid, d) {
    if (!grid) return;
    Object.keys(d.platforms).forEach(function (key) {
      var p = d.platforms[key];
      var card = el("article", "dl-card reveal");
      card.setAttribute("data-os", key);

      var icon = el("div", "os-icon");
      icon.innerHTML = OS_ICONS[key] || OS_ICONS.linux;
      card.appendChild(icon);

      card.appendChild(el("h3", null, p.label));
      card.appendChild(el("div", "os-hint", p.hint));

      if (p.primary) {
        var btn = el("a", "btn btn-primary", "下载安装包");
        btn.href = p.primary.url;
        btn.setAttribute("download", "");
        card.appendChild(btn);
      } else {
        var soon = el("span", "soon", "即将推出");
        card.appendChild(soon);
      }

      var meta = el("div", "meta");
      if (p.primary) {
        meta.appendChild(el("span", null, p.primary.name));
        meta.appendChild(el("span", null, p.primary.size));
      } else {
        meta.appendChild(el("span", null, "敬请期待"));
      }
      card.appendChild(meta);

      grid.appendChild(card);
    });
  }

  /* ---------- 渲染：下载页文件清单 ---------- */
  function renderFileRows(rows, d) {
    if (!rows) return;
    Object.keys(d.platforms).forEach(function (key) {
      var p = d.platforms[key];
      p.files.forEach(function (f) {
        var row = el("div", "file-row reveal");

        var name = el("div", "file-name", f.name);
        name.appendChild(el("div", "file-type", p.label + " · " + f.type));
        row.appendChild(name);

        row.appendChild(el("div", "file-size", f.size));

        var sha = el("div", "file-sha", f.sha256);
        row.appendChild(sha);

        var copy = el("button", "copy-btn", "复制校验值");
        copy.type = "button";
        copy.addEventListener("click", function () {
          copyChecksum(f.sha256, copy);
        });
        row.appendChild(copy);

        rows.appendChild(row);
      });
    });
  }

  /* ---------- 渲染：更新日志 ---------- */
  function renderChangelog(list, d) {
    if (!list) return;
    d.changelog.forEach(function (rel, i) {
      var item = el("article", "release reveal");

      var ver = el("div", "release-ver");
      var tag = el("div", "tag");
      var a = el("a", null, rel.version);
      a.href = d.product.repo + "/releases/tag/" + rel.tag;
      a.target = "_blank"; a.rel = "noopener";
      tag.appendChild(a);
      ver.appendChild(tag);
      ver.appendChild(el("div", "date", rel.date));
      if (i === 0) ver.appendChild(el("span", "badge-new", "最新"));
      item.appendChild(ver);

      var body = el("div", "release-body");
      var ul = el("ul");
      rel.items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      body.appendChild(ul);
      item.appendChild(body);

      list.appendChild(item);
    });
  }

  /* ---------- 校验值复制 ---------- */
  function copyChecksum(text, btn) {
    function done() {
      if (state.copiedTimer) clearTimeout(state.copiedTimer);
      btn.classList.add("copied");
      var old = btn.textContent;
      btn.textContent = "已复制";
      state.copiedTimer = setTimeout(function () {
        btn.classList.remove("copied");
        btn.textContent = old;
      }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  /* ---------- 滚动显现 ---------- */
  var revealIO = null;

  function observeReveals(forceInViewport) {
    if (!revealIO) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    $all(".reveal:not(.in)").forEach(function (n) {
      revealIO.observe(n);
      if (forceInViewport) {
        var r = n.getBoundingClientRect();
        if (r.top < vh) n.classList.add("in");
      }
    });
  }

  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      $all(".reveal").forEach(function (n) { n.classList.add("in"); });
      return;
    }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    observeReveals();
    // 兜底：IO 回调未触发（无头渲染 / 特殊环境）时，1.2s 后直接显现视口内元素，避免内容不可见
    setTimeout(function () { observeReveals(true); }, 1200);
  }

  /* ---------- 导航栏滚动状态 ---------- */
  function initNav() {
    var nav = $(".site-nav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- 场景 Tab ---------- */
  function initTabs() {
    var btns = $all(".tab-btn");
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        var target = b.getAttribute("data-tab");
        $all(".scene").forEach(function (s) {
          s.classList.toggle("active", s.id === target);
        });
      });
    });
  }

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initTabs();
    initReveal();
    loadData(function (d) {
      document.querySelectorAll("[data-version]").forEach(function (el) {
        el.textContent = "v" + d.latest.version;
      });
      renderHero($("#hero-cta"), d);
      renderCapabilities($("#caps-grid"), d);
      renderDlGrid($("#dl-grid"), d);
      renderFileRows($("#file-rows"), d);
      renderChangelog($("#changelog-list"), d);
      observeReveals();
      setTimeout(function () { observeReveals(true); }, 800);
    });
  });
})();
