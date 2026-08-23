/**
 * 账户中心页逻辑（零依赖）
 * - 无 token 时跳转登录页
 * - 加载 /api/me 与 /api/stats 并渲染
 * - 退出登录
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'specai_token';

  function t(key, fallback) {
    var dict = window.I18N || {};
    return dict[key] || fallback || '';
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function apiGet(path) {
    var tok = token();
    return fetch(path, { headers: { 'Authorization': 'Bearer ' + tok } }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function fmtTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function methodLabel(m) {
    return t(m === 'phone' ? 'acc-method-phone' : 'acc-method-email', m === 'phone' ? '手机' : '邮箱');
  }

  function render(user, stats, recent, license) {
    document.getElementById('acc-email').textContent = user.email || '-';
    document.getElementById('acc-phone').textContent = user.phone || '-';
    var plan = document.getElementById('acc-plan');
    plan.textContent = user.plan === 'pro' ? t('acc-plan-pro', 'Pro') : t('acc-plan-free', '免费版');
    plan.className = 'status-badge ' + (user.plan === 'pro' ? 'ready' : 'eval');
    document.getElementById('acc-since').textContent = fmtTime(user.createdAt);

    var subPlan = document.getElementById('acc-sub-plan');
    subPlan.textContent = user.plan === 'pro' ? t('acc-plan-pro', 'Pro') : t('acc-plan-free', '免费版');
    subPlan.className = 'status-badge ' + (user.plan === 'pro' ? 'ready' : 'eval');
    document.getElementById('acc-sub-expires').textContent =
      user.planExpiresAt ? fmtTime(user.planExpiresAt) : t('sub-never', '免费版无到期时间');

    var devBox = document.getElementById('acc-devices');
    devBox.innerHTML = '';
    var devices = (license && license.devices) ? license.devices : [];
    if (devices.length) {
      devices.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'acc-history-row';
        var nm = document.createElement('span');
        nm.className = 'acc-history-method';
        nm.textContent = d.name || d.deviceId;
        var tm = document.createElement('span');
        tm.className = 'acc-history-time';
        tm.textContent = fmtTime(d.lastSeenAt);
        row.appendChild(nm);
        row.appendChild(tm);
        devBox.appendChild(row);
      });
    } else {
      var empty = document.createElement('p');
      empty.className = 'acc-history-empty';
      empty.textContent = t('lic-devices-empty', '未绑定设备');
      devBox.appendChild(empty);
    }
    var limitEl = document.getElementById('acc-devices-limit');
    if (license && license.license && license.license.features) {
      limitEl.textContent = t('lic-devices-limit', '设备上限') + '：' + license.license.features.maxDevices;
    }

    document.getElementById('acc-logins').textContent = stats ? String(stats.totalLogins || 0) : '0';
    document.getElementById('acc-devices').textContent = stats ? String(stats.uniqueDevices || 0) : '0';
    document.getElementById('acc-last').textContent = stats ? fmtTime(stats.lastLoginAt) : '-';

    var box = document.getElementById('acc-history');
    box.innerHTML = '';
    if (!recent || !recent.length) {
      var empty = document.createElement('p');
      empty.className = 'acc-history-empty';
      empty.textContent = t('acc-history-empty', '暂无记录');
      box.appendChild(empty);
      return;
    }
    recent.forEach(function (x) {
      var row = document.createElement('div');
      row.className = 'acc-history-row';
      var m = document.createElement('span');
      m.className = 'acc-history-method';
      m.textContent = methodLabel(x.method);
      var tm = document.createElement('span');
      tm.className = 'acc-history-time';
      tm.textContent = fmtTime(x.at);
      row.appendChild(m);
      row.appendChild(tm);
      box.appendChild(row);
    });
  }

  function init() {
    if (!token()) { window.location.href = 'login.html'; return; }
    var loading = document.getElementById('acc-loading');
    var body = document.getElementById('acc-body');
    Promise.all([apiGet('/api/me'), apiGet('/api/stats'), apiGet('/api/license/check')]).then(function (res) {
      var me = res[0], st = res[1], lic = res[2];
      if (me.status !== 200 || !me.data.ok) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
        window.location.href = 'login.html';
        return;
      }
      var statsData = (st.status === 200 && st.data.ok) ? st.data.stats : null;
      var recent = (st.status === 200 && st.data.ok) ? st.data.recentLogins : [];
      var licData = (lic.status === 200 && lic.data.ok) ? lic.data : null;
      loading.hidden = true;
      body.hidden = false;
      render(me.data.user, statsData, recent, licData);
    }).catch(function () {
      loading.textContent = t('acc-err-net', '网络异常，请稍后再试');
    });

    document.getElementById('acc-logout').addEventListener('click', function () {
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('specai_user'); } catch (e) { /* ignore */ }
      window.location.href = 'login.html';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
