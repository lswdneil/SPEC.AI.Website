/**
 * 定价页逻辑（零依赖）
 * - 从 /api/plans 读取四档计划价格并动态渲染（Free/Lite/Pro/Max，REQ-001）
 * - 每张付费卡独立月付/年付切换
 * - 订阅下单：未登录跳登录页；已登录按卡片 data-plan 创建订单并展示
 * - 开发模式提供"模拟支付成功"按钮（调用 /api/subscription/activate）
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'specai_token';
  var PAID_PLANS = ['Lite', 'Pro', 'Max'];
  var orderBox = document.getElementById('pr-order');
  var activateBtn = document.getElementById('pr-activate');

  function t(key, fallback) {
    var dict = window.I18N || {};
    return dict[key] || fallback || '';
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (token()) opts.headers['Authorization'] = 'Bearer ' + token();
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function fmtPrice(cents) {
    return '¥' + (cents / 100).toFixed(2).replace(/\.00$/, '');
  }

  // 当前各卡片的付费周期（卡片 data-plan → period）
  var periods = {};
  PAID_PLANS.forEach(function (id) { periods[id] = 'monthly'; });

  function renderPrice(plans) {
    if (!plans || !plans.length) return;
    var byId = {};
    plans.forEach(function (p) { byId[p.id] = p; });
    PAID_PLANS.forEach(function (id) {
      var plan = byId[id];
      var el = document.getElementById('pr-price-' + id);
      if (!plan || !el) return;
      var cents = periods[id] === 'yearly' ? plan.yearlyCents : plan.monthlyCents;
      var per = cents / (periods[id] === 'yearly' ? 12 : 1);
      el.textContent = fmtPrice(Math.round(per));
    });
  }

  function bindPeriod(card) {
    var planId = card.getAttribute('data-plan');
    card.querySelectorAll('.plan-period-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        periods[planId] = b.getAttribute('data-period');
        card.querySelectorAll('.plan-period-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        api('GET', '/api/plans').then(function (r) {
          if (r.status === 200 && r.data.ok) renderPrice(r.data.plans);
        });
      });
    });
  }

  document.querySelectorAll('.plan-card[data-plan]').forEach(function (card) {
    bindPeriod(card);
    var btn = card.querySelector('.pr-subscribe');
    if (!btn) return;
    var planId = card.getAttribute('data-plan');
    btn.addEventListener('click', function () {
      if (!token()) {
        window.location.href = 'login.html?next=pricing.html';
        return;
      }
      btn.disabled = true;
      api('POST', '/api/subscription/orders', { plan: planId, period: periods[planId] })
        .then(function (r) {
          btn.disabled = false;
          if (r.status === 200 && r.data.ok) {
            document.getElementById('pr-order-no').textContent = r.data.order.orderNo;
            document.getElementById('pr-order-amount').textContent =
              fmtPrice(r.data.order.amountCents) + ' ' + r.data.order.currency;
            orderBox.hidden = false;
            if (r.data.devMode) activateBtn.hidden = false;
          } else {
            orderBox.hidden = false;
            document.getElementById('pr-order-no').textContent = '-';
            document.getElementById('pr-order-amount').textContent = t('pr-order-fail', '下单失败，请稍后再试');
          }
        })
        .catch(function () {
          btn.disabled = false;
          orderBox.hidden = false;
          document.getElementById('pr-order-no').textContent = '-';
          document.getElementById('pr-order-amount').textContent = t('pr-err-net', '网络异常，请稍后再试');
        });
    });
  });

  activateBtn.addEventListener('click', function () {
    var no = document.getElementById('pr-order-no').textContent;
    if (!no || no === '-') return;
    activateBtn.disabled = true;
    api('POST', '/api/subscription/activate', { orderNo: no })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          var ok = document.createElement('p');
          ok.className = 'auth-msg ok';
          ok.textContent = t('pr-order-activated', '订阅已激活');
          orderBox.appendChild(ok);
          setTimeout(function () { window.location.href = 'account.html'; }, 800);
        } else {
          activateBtn.disabled = false;
        }
      })
      .catch(function () { activateBtn.disabled = false; });
  });

  api('GET', '/api/plans').then(function (r) {
    if (r.status === 200 && r.data.ok) renderPrice(r.data.plans);
  });
})();
