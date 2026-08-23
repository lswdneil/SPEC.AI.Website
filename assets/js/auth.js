/**
 * 登录/注册页逻辑（零依赖）
 * - 邮箱+密码 / 手机+验证码 两种方式
 * - 登录成功后将 token 存入 localStorage（specai_token）
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'specai_token';
  var USER_KEY = 'specai_user';

  var form = document.getElementById('auth-form');
  var targetInput = document.getElementById('auth-target');
  var passwordInput = document.getElementById('auth-password');
  var passwordWrap = document.getElementById('auth-password-wrap');
  var codeInput = document.getElementById('auth-code');
  var codeWrap = document.getElementById('auth-code-wrap');
  var sendBtn = document.getElementById('auth-send-code');
  var submitBtn = document.getElementById('auth-submit');
  var msgEl = document.getElementById('auth-msg');
  var mode = 'login';
  var method = 'email';
  var countdownTimer = null;

  function t(key, fallback) {
    var dict = window.I18N || {};
    return dict[key] || fallback || '';
  }

  function showMsg(text, type) {
    msgEl.textContent = text || '';
    msgEl.className = 'auth-msg' + (type ? ' ' + type : '');
  }

  function updateForm() {
    var isEmail = method === 'email';
    passwordWrap.hidden = !isEmail;
    codeWrap.hidden = isEmail && mode === 'login';
    var label = document.querySelector('.auth-field label[for="auth-target"]');
    if (label) label.textContent = t(isEmail ? 'auth-email' : 'auth-phone', isEmail ? '邮箱' : '手机号');
    targetInput.type = isEmail ? 'email' : 'tel';
    targetInput.placeholder = isEmail ? 'you@example.com' : '13800000000';
    if (!isEmail) targetInput.setAttribute('inputmode', 'numeric');
    else targetInput.removeAttribute('inputmode');
    submitBtn.textContent = t(mode === 'login' ? 'auth-submit-login' : 'auth-submit-register', mode === 'login' ? '登录' : '注册');
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
      too_many_attempts: 'auth-err-limited',
      too_many_requests: 'auth-err-limited',
      account_disabled: 'auth-err-disabled',
      invalid_target: 'auth-err-invalid'
    };
    return t(map[err] || 'auth-err-generic', '操作失败，请稍后再试');
  }

  sendBtn.addEventListener('click', function () {
    var target = targetInput.value.trim();
    if (!target) { showMsg(t('auth-err-target-empty', '请先填写邮箱或手机号'), 'error'); return; }
    showMsg(t('auth-msg-sending', '验证码发送中…'));
    api('/api/auth/send-code', { target: target, purpose: mode === 'register' ? 'register' : 'login' })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          showMsg(t('auth-msg-sent', '验证码已发送'), 'ok');
          startCountdown(60);
        } else {
          showMsg(errorText(r.data.error), 'error');
        }
      })
      .catch(function () { showMsg(t('auth-err-net', '网络异常，请稍后再试'), 'error'); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var target = targetInput.value.trim();
    var password = passwordInput.value;
    var code = codeInput.value.trim();
    if (!target) { showMsg(t('auth-err-target-empty', '请先填写邮箱或手机号'), 'error'); return; }
    if (method === 'email' && mode === 'login' && password.length < 8) {
      showMsg(t('auth-err-password', '密码至少 8 位'), 'error'); return;
    }
    if (method === 'email' && mode === 'register' && password.length < 8) {
      showMsg(t('auth-err-password', '密码至少 8 位'), 'error'); return;
    }
    if (codeWrap.hidden === false && !code) {
      showMsg(t('auth-err-code-required', '请填写验证码'), 'error'); return;
    }

    var body;
    if (method === 'email') {
      body = { method: 'email', email: target, password: password };
      if (mode === 'register') body.code = code;
    } else {
      body = { method: 'phone', phone: target, code: code };
    }
    var path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    submitBtn.disabled = true;
    api(path, body)
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          localStorage.setItem(TOKEN_KEY, r.data.token);
          localStorage.setItem(USER_KEY, JSON.stringify(r.data.user || {}));
          showMsg(t('auth-msg-ok', '成功，正在跳转…'), 'ok');
          setTimeout(function () { window.location.href = 'account.html'; }, 600);
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
