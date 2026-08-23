/**
 * 登录/注册/密码重置页逻辑（零依赖）
 * - 邮箱+密码 / 手机+验证码 两种方式
 * - 忘记密码：邮箱 + 验证码 + 新密码
 * - 登录成功后将 token 存入 localStorage（specai_token），支持 ?next= 回跳
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'specai_token';
  var USER_KEY = 'specai_user';
  var SAFE_PAGES = ['index.html', 'account.html', 'pricing.html', 'download.html', 'changelog.html', 'hardware.html', 'login.html'];

  var form = document.getElementById('auth-form');
  var targetInput = document.getElementById('auth-target');
  var passwordInput = document.getElementById('auth-password');
  var passwordWrap = document.getElementById('auth-password-wrap');
  var codeInput = document.getElementById('auth-code');
  var codeWrap = document.getElementById('auth-code-wrap');
  var sendBtn = document.getElementById('auth-send-code');
  var submitBtn = document.getElementById('auth-submit');
  var msgEl = document.getElementById('auth-msg');
  var forgotBtn = document.getElementById('auth-forgot');
  var backBtn = document.getElementById('auth-back-login');
  var mode = 'login';
  var method = 'email';
  var countdownTimer = null;

  function t(key, fallback) {
    var dict = window.I18N || {};
    return dict[key] || fallback || '';
  }

  function nextPage() {
    var next = '';
    try { next = new URLSearchParams(window.location.search).get('next') || ''; } catch (e) { /* ignore */ }
    if (next && SAFE_PAGES.indexOf(next) !== -1) return next;
    return 'account.html';
  }

  function showMsg(text, type) {
    msgEl.textContent = text || '';
    msgEl.className = 'auth-msg' + (type ? ' ' + type : '');
  }

  function updateForm() {
    var isEmail = method === 'email';
    var isReset = mode === 'reset';
    passwordWrap.hidden = !isEmail;                 // 重置与邮箱登录/注册都显示密码
    codeWrap.hidden = isEmail && mode === 'login';  // 邮箱登录无需验证码
    forgotBtn.hidden = !(mode === 'login' && isEmail);
    backBtn.hidden = !isReset;
    // 重置仅支持邮箱（手机账号无密码）
    document.querySelectorAll('.auth-method').forEach(function (b) {
      b.disabled = isReset && b.getAttribute('data-method') !== 'email';
    });
    var label = document.querySelector('.auth-field label[for="auth-target"]');
    if (label) label.textContent = t(isEmail ? 'auth-email' : 'auth-phone', isEmail ? '邮箱' : '手机号');
    targetInput.type = isEmail ? 'email' : 'tel';
    targetInput.placeholder = isEmail ? 'you@example.com' : '13800000000';
    if (!isEmail) targetInput.setAttribute('inputmode', 'numeric');
    else targetInput.removeAttribute('inputmode');
    if (isReset) {
      passwordInput.placeholder = t('auth-new-password', '新密码，至少 8 位');
      submitBtn.textContent = t('auth-submit-reset', '重置密码');
    } else {
      passwordInput.placeholder = t('auth-password-ph', '至少 8 位');
      submitBtn.textContent = t(mode === 'login' ? 'auth-submit-login' : 'auth-submit-register', mode === 'login' ? '登录' : '注册');
    }
    showMsg('');
  }

  function startCountdown(sec) {
    if (countdownTimer) clearInterval(countdownTimer);
    var left = sec;
    sendBtn.disabled = true;
    sendBtn.textContent = t('auth-resend', '重新获取') + ' (' + left + 's)';
    countdownTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(countdownTimer);
        sendBtn.disabled = false;
        sendBtn.textContent = t('auth-send-code', '获取验证码');
      } else {
        sendBtn.textContent = t('auth-resend', '重新获取') + ' (' + left + 's)';
      }
    }, 1000);
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function errorText(err) {
    var map = {
      invalid_email: 'auth-err-invalid',
      invalid_phone: 'auth-err-invalid',
      invalid_password: 'auth-err-password',
      code_required: 'auth-err-code-required',
      code_invalid: 'auth-err-code',
      code_used: 'auth-err-code',
      code_expired: 'auth-err-code-expired',
      already_registered: 'auth-err-exists',
      bad_credentials: 'auth-err-credentials',
      account_not_registered: 'auth-err-not-found',
      account_not_found: 'auth-err-not-found',
      too_many_attempts: 'auth-err-limited',
      too_many_requests: 'auth-err-limited',
      account_disabled: 'auth-err-disabled',
      invalid_target: 'auth-err-invalid'
    };
    return t(map[err] || 'auth-err-generic', '操作失败，请稍后再试');
  }

  function sendCodeNow() {
    var target = targetInput.value.trim();
    if (!target) { showMsg(t('auth-err-target-empty', '请先填写邮箱或手机号'), 'error'); return; }
    var purpose = mode === 'register' ? 'register' : (mode === 'reset' ? 'reset' : 'login');
    showMsg(t('auth-msg-sending', '验证码发送中…'));
    api('/api/auth/send-code', { target: target, purpose: purpose })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          showMsg(t('auth-msg-sent', '验证码已发送'), 'ok');
          startCountdown(60);
        } else {
          showMsg(errorText(r.data.error), 'error');
        }
      })
      .catch(function () { showMsg(t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
  }

  sendBtn.addEventListener('click', sendCodeNow);

  forgotBtn.addEventListener('click', function () {
    mode = 'reset';
    updateForm();
  });

  backBtn.addEventListener('click', function () {
    mode = 'login';
    updateForm();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var target = targetInput.value.trim();
    var password = passwordInput.value;
    var code = codeInput.value.trim();
    if (!target) { showMsg(t('auth-err-target-empty', '请先填写邮箱或手机号'), 'error'); return; }
    if (method === 'email' && mode !== 'reset' && password.length < 8) {
      showMsg(t('auth-err-password', '密码至少 8 位'), 'error'); return;
    }
    if (method === 'email' && mode === 'reset' && password.length < 8) {
      showMsg(t('auth-err-password', '密码至少 8 位'), 'error'); return;
    }
    if (codeWrap.hidden === false && !code) {
      showMsg(t('auth-err-code-required', '请填写验证码'), 'error'); return;
    }

    var body, path;
    if (mode === 'reset') {
      if (method !== 'email') { showMsg(t('auth-err-invalid', '格式不正确'), 'error'); return; }
      path = '/api/auth/reset-password';
      body = { email: target, code: code, newPassword: password };
    } else if (method === 'email') {
      body = { method: 'email', email: target, password: password };
      if (mode === 'register') body.code = code;
      path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    } else {
      body = { method: 'phone', phone: target, code: code };
      path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    }

    submitBtn.disabled = true;
    api(path, body)
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          if (mode === 'reset') {
            showMsg(t('auth-msg-reset-ok', '密码已重置，请登录'), 'ok');
            mode = 'login';
            updateForm();
            submitBtn.disabled = false;
            return;
          }
          localStorage.setItem(TOKEN_KEY, r.data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(r.data.user || {}));
          showMsg(t('auth-msg-ok', '成功，正在跳转…'), 'ok');
          setTimeout(function () { window.location.href = nextPage(); }, 600);
        } else {
          showMsg(errorText(r.data.error), 'error');
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        showMsg(t('auth-err-net', '网络异常，请稍后再试'), 'error');
        submitBtn.disabled = false;
      });
  });

  document.querySelectorAll('.auth-tab').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      document.querySelectorAll('.auth-tab').forEach(function (x) { x.classList.toggle('active', x === b); });
      updateForm();
    });
  });

  document.querySelectorAll('.auth-method').forEach(function (b) {
    b.addEventListener('click', function () {
      method = b.getAttribute('data-method');
      document.querySelectorAll('.auth-method').forEach(function (x) { x.classList.toggle('active', x === b); });
      updateForm();
    });
  });

  updateForm();
})();
