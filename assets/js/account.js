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

  function planLabel(p) {
    var map = { Free: t('acc-plan-free', '免费版'), Lite: 'Lite', Pro: 'Pro', Max: 'Max' };
    return map[p] || map.Free;
  }
  function planReady(p) { return p === 'Pro' || p === 'Max'; }

  function render(user, stats, recent, license) {
    document.getElementById('acc-email').textContent = user.email || '-';
    document.getElementById('acc-phone').textContent = user.phone || '-';
    var plan = document.getElementById('acc-plan');
    plan.textContent = planLabel(user.plan);
    plan.className = 'status-badge ' + (planReady(user.plan) ? 'ready' : 'eval');
    document.getElementById('acc-since').textContent = fmtTime(user.createdAt);

    var subPlan = document.getElementById('acc-sub-plan');
    subPlan.textContent = planLabel(user.plan);
    subPlan.className = 'status-badge ' + (planReady(user.plan) ? 'ready' : 'eval');
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

  function secMsg(el, text, type) {
    el.textContent = text || '';
    el.className = 'auth-msg' + (type ? ' ' + type : '');
  }

  function secErrorText(err) {
    var map = {
      bad_credentials: 'sec-err-old',
      invalid_password: 'auth-err-password',
      code_required: 'auth-err-code-required',
      code_invalid: 'auth-err-code',
      code_used: 'auth-err-code',
      code_expired: 'auth-err-code-expired',
      too_many_requests: 'auth-err-limited'
    };
    return t(map[err] || 'auth-err-generic', '操作失败，请稍后再试');
  }

  function clearSessionAndGo(url, ms) {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('specai_user'); } catch (e) { /* ignore */ }
    setTimeout(function () { window.location.href = url; }, ms || 1200);
  }

  /* 绑定/更换手机号（多重账户验证：邮箱 + 手机双身份可登录） */
  function initBindPhone(user) {
    var btn = document.getElementById('acc-bind-phone');
    var form = document.getElementById('acc-bind-form');
    var msg = document.getElementById('bind-msg');
    var phoneEl = document.getElementById('acc-phone');
    if (!btn || !form) return;
    if (user.phone) btn.textContent = t('acc-bind-change', '更换手机号');

    function setMsg(text, type) {
      msg.textContent = text || '';
      msg.className = 'auth-msg' + (type ? ' ' + type : '');
    }
    function validPhone(p) { return /^1[3-9]\d{9}$/.test(p); }

    btn.addEventListener('click', function () { form.hidden = !form.hidden; setMsg(''); });
    document.getElementById('bind-cancel').addEventListener('click', function () { form.hidden = true; setMsg(''); });

    document.getElementById('bind-send').addEventListener('click', function () {
      var p = document.getElementById('bind-phone').value.trim();
      if (!validPhone(p)) { setMsg(t('auth-err-invalid', '格式不正确'), 'error'); return; }
      apiPost('/api/auth/send-code', { target: p, purpose: 'bind' })
        .then(function (r) {
          setMsg(r.status === 200 && r.data.ok ? t('auth-msg-sent', '验证码已发送') : secErrorText(r.data.error),
            r.status === 200 ? 'ok' : 'error');
        })
        .catch(function () { setMsg(t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });

    document.getElementById('bind-confirm').addEventListener('click', function () {
      var p = document.getElementById('bind-phone').value.trim();
      var c = document.getElementById('bind-code').value.trim();
      if (!validPhone(p)) { setMsg(t('auth-err-invalid', '格式不正确'), 'error'); return; }
      if (!c) { setMsg(t('auth-err-code-required', '请填写验证码'), 'error'); return; }
      apiPost('/api/auth/bind', { method: 'phone', phone: p, code: c })
        .then(function (r) {
          if (r.status === 200 && r.data.ok) {
            phoneEl.textContent = p;
            try { localStorage.setItem('specai_user', JSON.stringify(r.data.user || {})); } catch (e) { /* ignore */ }
            btn.textContent = t('acc-bind-change', '更换手机号');
            form.hidden = true;
            setMsg(t('acc-bind-ok', '绑定成功'), 'ok');
          } else {
            setMsg(secErrorText(r.data.error), 'error');
          }
        })
        .catch(function () { setMsg(t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });
  }

  function initSecurity(user) {
    var changeBox = document.getElementById('sec-change');
    var noPwHint = document.getElementById('sec-no-password');
    if (!user.hasPassword) {
      changeBox.hidden = true;
      noPwHint.hidden = false;
    }

    var changeMsg = document.getElementById('sec-change-msg');
    document.getElementById('sec-change-btn').addEventListener('click', function () {
      var oldPw = document.getElementById('sec-old').value;
      var newPw = document.getElementById('sec-new').value;
      if (newPw.length < 8) { secMsg(changeMsg, t('auth-err-password', '密码至少 8 位'), 'error'); return; }
      apiPost('/api/auth/change-password', { oldPassword: oldPw, newPassword: newPw })
        .then(function (r) {
          if (r.status === 200 && r.data.ok) {
            secMsg(changeMsg, t('sec-msg-changed', '密码已修改，请重新登录'), 'ok');
            clearSessionAndGo('login.html');
          } else {
            secMsg(changeMsg, secErrorText(r.data.error), 'error');
          }
        })
        .catch(function () { secMsg(changeMsg, t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });

    document.getElementById('sec-revoke').addEventListener('click', function () {
      apiPost('/api/auth/revoke-all', {})
        .then(function (r) {
          if (r.status === 200 && r.data.ok) {
            secMsg(changeMsg, t('sec-msg-revoked', '已退出所有设备，请重新登录'), 'ok');
            clearSessionAndGo('login.html');
          } else {
            secMsg(changeMsg, secErrorText(r.data.error), 'error');
          }
        })
        .catch(function () { secMsg(changeMsg, t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });

    var deactForm = document.getElementById('sec-deact-form');
    var pwWrap = document.getElementById('sec-deact-pw-wrap');
    var codeWrap = document.getElementById('sec-deact-code-wrap');
    var deactMsg = document.getElementById('sec-deact-msg');

    document.getElementById('sec-deactivate').addEventListener('click', function () {
      deactForm.hidden = !deactForm.hidden;
      secMsg(deactMsg, '');
      if (user.hasPassword) { pwWrap.hidden = false; codeWrap.hidden = true; }
      else { pwWrap.hidden = true; codeWrap.hidden = false; }
    });

    document.getElementById('sec-deact-send').addEventListener('click', function () {
      apiPost('/api/auth/send-code', { target: user.phone, purpose: 'login' })
        .then(function (r) {
          secMsg(deactMsg, r.status === 200 && r.data.ok
            ? t('auth-msg-sent', '验证码已发送') : secErrorText(r.data.error), r.status === 200 ? 'ok' : 'error');
        })
        .catch(function () { secMsg(deactMsg, t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });

    document.getElementById('sec-deact-confirm').addEventListener('click', function () {
      var body = user.hasPassword
        ? { password: document.getElementById('sec-deact-pw').value }
        : { code: document.getElementById('sec-deact-code').value.trim() };
      apiPost('/api/auth/deactivate', body)
        .then(function (r) {
          if (r.status === 200 && r.data.ok) {
            secMsg(deactMsg, t('sec-msg-deactivated', '账号已注销'), 'ok');
            clearSessionAndGo('index.html');
          } else {
            secMsg(deactMsg, secErrorText(r.data.error), 'error');
          }
        })
        .catch(function () { secMsg(deactMsg, t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
    });
  }

  function apiPost(path, body) {
    var tok = token();
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
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
      initSecurity(me.data.user);
      initBindPhone(me.data.user);
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
