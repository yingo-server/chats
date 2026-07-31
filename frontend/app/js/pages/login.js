/* ═══ Login Page ═══ */
window.LoginPage = {
  mount() {
    const app = Utils.id('app');
    app.innerHTML = '';

    const page = Utils.create('div', { className: 'auth-page' });
    const card = Utils.create('div', { className: 'auth-card' });

    card.innerHTML = `
      <div class="auth-logo">
        <span class="material-symbols-outlined">chat</span>
        <span>Yingo</span>
      </div>
      <div class="auth-title">登录</div>
      <div class="input-group">
        <input id="login-user" class="input" type="text" placeholder="用户名" autocomplete="username">
      </div>
      <div class="input-group">
        <input id="login-pass" class="input" type="password" placeholder="密码" autocomplete="current-password">
      </div>
      <button id="login-btn" class="btn btn-primary btn-block btn-lg">登录</button>
      <div id="login-error" class="auth-error"></div>
      <div class="auth-link">还没有账号？<a id="go-register">立即注册</a></div>
    `;

    page.appendChild(card);
    app.appendChild(page);

    const userInput = Utils.id('login-user');
    const passInput = Utils.id('login-pass');
    const btn = Utils.id('login-btn');
    const errorEl = Utils.id('login-error');

    const doLogin = async () => {
      const username = userInput.value.trim();
      const password = passInput.value;
      if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
      }
      btn.disabled = true;
      btn.textContent = '登录中...';
      errorEl.textContent = '';
      try {
        await Auth.login(username, password);
        Ws.connect();
        window.location.hash = '#/';
      } catch (e) {
        errorEl.textContent = e.message || '登录失败';
      } finally {
        btn.disabled = false;
        btn.textContent = '登录';
      }
    };

    Utils.on(btn, 'click', doLogin);
    Utils.on(passInput, 'keydown', e => { if (e.key === 'Enter') doLogin(); });
    Utils.on(userInput, 'keydown', e => { if (e.key === 'Enter') passInput.focus(); });
    Utils.on(Utils.id('go-register'), 'click', () => { window.location.hash = '#/register'; });

    userInput.focus();
  },

  destroy() {},
};
