/* ============================================================
   1号员工 — 官网交互脚本
   功能：i18n 四语切换（中/英/日/韩）、多色主题切换、平台识别、
        动态渲染（能力/更新日志/下载按钮）、校验值复制、场景 Tab
   ============================================================ */
(function () {
  "use strict";

  var DATA_URL = "data/releases.json";
  var LANG_KEY = "dsh-site-lang";
  var LANGS = ["zh", "en", "ja", "ko"];
  var LANG_ATTR = { zh: "zh-CN", en: "en", ja: "ja", ko: "ko" };
  var state = { data: null, os: detectOS(), lang: "zh", dict: null, copiedTimer: null };

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

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  /* 取当前语言文案，缺失回退原文 */
  function t(key, fallback) {
    if (state.dict && state.dict[key] != null) return state.dict[key];
    return fallback != null ? fallback : "";
  }

  /* ---------- i18n ---------- */
  function loadLangDict(lang, cb) {
    var s = document.createElement("script");
    // 带时间戳绕过浏览器缓存，确保总是加载最新字典
    s.src = "assets/i18n/" + lang + ".js?t=" + Date.now();
    s.onload = function () { state.dict = window.I18N || {}; cb && cb(); };
    s.onerror = function () { state.dict = null; cb && cb(); };
    document.head.appendChild(s);
  }

  function applyStaticI18n() {
    $all("[data-i18n]").forEach(function (n) {
      var key = n.getAttribute("data-i18n");
      var val = t(key, "");
      if (val == null || val === "") return;
      if (n.children.length === 0) {
        // 纯文本元素：整体替换
        n.textContent = val;
      } else {
        // 含子元素（如箭头、出处标签）：保留子元素，只替换自身文本节点
        var textNodes = [];
        for (var i = 0; i < n.childNodes.length; i++) {
          if (n.childNodes[i].nodeType === 3) textNodes.push(n.childNodes[i]);
        }
        if (textNodes.length) {
          textNodes[0].textContent = val;
          for (var j = 1; j < textNodes.length; j++) textNodes[j].remove();
        } else {
          n.textContent = val;
        }
      }
    });
    $all("[data-i18n-alt]").forEach(function (n) {
      var key = n.getAttribute("data-i18n-alt");
      var v = t(key, n.getAttribute("alt"));
      if (v) n.setAttribute("alt", v);
    });
  }

  function setLang(lang, cb) {
    if (LANGS.indexOf(lang) === -1) lang = "zh";
    loadLangDict(lang, function () {
      state.lang = lang;
      document.documentElement.lang = LANG_ATTR[lang] || "zh-CN";
      var sel = $(".lang-select");
      if (sel) sel.value = lang;
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
      applyStaticI18n();
      initAuthNav();
      alignNavButtons();
      rerenderDynamic();
      cb && cb();
    });
  }

  function initLang() {
    var saved = "zh";
    try { saved = localStorage.getItem(LANG_KEY) || "zh"; } catch (e) { /* ignore */ }
    var sel = $(".lang-select");
    if (sel) {
      sel.addEventListener("change", function () { setLang(sel.value); });
    }
    setLang(saved);
  }

  /* ---------- 平台图标（Simple Icons 标准品牌 SVG，CC0 免费） ---------- */
  var OS_ICONS = {
    windows: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623"/></svg>',
    macos: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
    linux: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z"/></svg>',
    android: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 00-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 00-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 00-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z"/></svg>'
  };

  /* ---------- 渲染：hero 下载区（主下载按钮 + 预留平台小入口） ---------- */
  var OS_NAMES = { windows: "Windows", macos: "macOS", android: "Android", linux: "Linux" };
  var HERO_KEYS = ["windows", "macos", "android", "linux"];

  function renderHero(container, d) {
    if (!container) return;
    container.innerHTML = "";
    var wrap = el("div", "hero-dl");
    var main = el("div", "hero-dl-main");
    var soon = el("div", "hero-soon-row");
    HERO_KEYS.forEach(function (key) {
      var p = d.platforms[key];
      var name = OS_NAMES[key] || key;
      if (p && p.primary) {
        var btn = el("a", "btn btn-primary");
        btn.href = p.primary.url;
        btn.setAttribute("download", "");
        var label = t("dl-for", "下载 " + d.product.name + " for " + name)
          .replace(/\{name\}/g, d.product.name).replace(/\{os\}/g, name);
        btn.innerHTML = OS_ICONS[key] + "<span>" + label + "</span>" + '<span class="arrow" aria-hidden="true">→</span>';
        main.appendChild(btn);
      } else {
        // 预留入口：小胶囊，弱化显示，点击跳转下载页
        var chip = el("a", "hero-soon-item");
        chip.href = "download.html";
        chip.innerHTML = OS_ICONS[key] + "<span>" + name + " " + t("hero-soon", "即将推出") + "</span>";
        soon.appendChild(chip);
      }
    });
    if (main.children.length) wrap.appendChild(main);
    if (soon.children.length) wrap.appendChild(soon);
    container.appendChild(wrap);
  }

  /* ---------- 渲染：能力特性（Bento，i18n） ---------- */
  function renderCapabilities(container, d) {
    if (!container || !d.capabilities) return;
    container.innerHTML = "";
    d.capabilities.forEach(function (c, i) {
      var cls = "cap-item reveal";
      if (i >= 2 && i < 5) cls += " cap-sm";
      if (i === 5) cls += " cap-wide";

      var item = el("div", cls);
      if (c.tag) item.appendChild(el("span", "cap-tag", c.tag));
      item.appendChild(el("h3", null, t("cap-" + (i + 1) + "-title", c.title)));
      item.appendChild(el("p", null, t("cap-" + (i + 1) + "-desc", c.desc)));
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
        var btn = el("a", "btn btn-primary", t("dl-download-btn", "下载安装包"));
        btn.href = p.primary.url;
        btn.setAttribute("download", "");
        card.appendChild(btn);
      } else {
        var soon = el("span", "soon", t("dl-soon", "即将推出"));
        card.appendChild(soon);
      }

      var meta = el("div", "meta");
      if (p.primary) {
        meta.appendChild(el("span", null, p.primary.name));
        meta.appendChild(el("span", null, p.primary.size));
      } else {
        meta.appendChild(el("span", null, t("dl-soon-meta", "敬请期待")));
      }
      card.appendChild(meta);

      grid.appendChild(card);
    });
  }

  /* ---------- 渲染：下载页文件清单 ---------- */
  function renderFileRows(rows, d) {
    if (!rows) return;
    rows.querySelectorAll(".file-row:not(.head)").forEach(function (n) { n.remove(); });
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

        var copy = el("button", "copy-btn", t("copy-btn", "复制校验值"));
        copy.type = "button";
        copy.addEventListener("click", function () {
          copyChecksum(f.sha256, copy);
        });
        row.appendChild(copy);

        rows.appendChild(row);
      });
    });
  }

  /* ---------- 渲染：更新日志（i18n） ---------- */
  function renderChangelog(list, d) {
    if (!list) return;
    list.innerHTML = "";
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
      if (i === 0) ver.appendChild(el("span", "badge-new", t("badge-new", "最新")));
      item.appendChild(ver);

      var body = el("div", "release-body");
      var ul = el("ul");
      rel.items.forEach(function (txt, j) {
        var k = "log-" + rel.version + "-i" + (j + 1);
        ul.appendChild(el("li", null, t(k, txt)));
      });
      body.appendChild(ul);
      item.appendChild(body);

      list.appendChild(item);
    });
  }

  /* ---------- 动态内容重渲染（语言切换时） ---------- */
  function rerenderDynamic() {
    if (!state.data) return;
    renderHero($("#hero-cta"), state.data);
    renderCapabilities($("#caps-grid"), state.data);
    renderDlGrid($("#dl-grid"), state.data);
    renderFileRows($("#file-rows"), state.data);
    renderChangelog($("#changelog-list"), state.data);
    observeReveals();
  }

  /* ---------- 校验值复制 ---------- */
  function copyChecksum(text, btn) {
    function done() {
      if (state.copiedTimer) clearTimeout(state.copiedTimer);
      btn.classList.add("copied");
      var old = btn.textContent;
      btn.textContent = t("copied", "已复制");
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

  /* ---------- 导航登录状态（登录后显示"账户"） ---------- */
  function initAuthNav() {
    var link = $(".nav-auth");
    if (!link) return;
    var token = "";
    try { token = localStorage.getItem("specai_token") || ""; } catch (e) { /* ignore */ }
    if (token) {
      link.setAttribute("data-i18n", "nav-account");
      link.href = "account.html";
      link.textContent = t("nav-account", "账户");
    } else {
      link.setAttribute("data-i18n", "nav-login");
      link.href = "login.html";
      link.textContent = t("nav-login", "登录");
    }
  }

  /* ---------- 导航按钮等宽对齐（GitHub/物理接入/登录/语言 取最大宽度统一） ---------- */
  function alignNavButtons() {
    var items = $all(".nav-gh, .lang-select");
    if (!items.length) return;
    var max = 0;
    items.forEach(function (n) {
      var w = n.offsetWidth;
      if (w > max) max = w;
    });
    items.forEach(function (n) { n.style.width = max + "px"; });
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

  /* ---------- 数据加载 ---------- */
  function loadData(cb) {
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) { state.data = d; cb(d); })
      .catch(function (e) {
        console.error("无法加载 releases.json：", e);
        document.querySelectorAll("[data-version]").forEach(function (el) {
          el.textContent = "-";
        });
      });
  }

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initTabs();
    initReveal();
    initLang();
    loadData(function (d) {
      document.querySelectorAll("[data-version]").forEach(function (el) {
        el.textContent = d.latest.version;
      });
      rerenderDynamic();
      observeReveals();
      setTimeout(function () { observeReveals(true); }, 800);
    });
  });
})();
