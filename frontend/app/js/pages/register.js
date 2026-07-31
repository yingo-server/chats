/* ═══ Register Page ═══ */
window.RegisterPage = {
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
      <div class="auth-title">注册</div>
      <div class="input-group">
        <input id="reg-user" class="input" type="text" placeholder="用户名 (2-20位)" autocomplete="username">
      </div>
      <div class="input-group">
        <input id="reg-pass" class="input" type="password" placeholder="密码 (至少8位)" autocomplete="new-password">
      </div>
      <div class="input-group">
        <input id="reg-pass2" class="input" type="password" placeholder="确认密码" autocomplete="new-password">
      </div>
      <button id="reg-btn" class="btn btn-primary btn-block btn-lg">注册</button>
      <div id="reg-error" class="auth-error"></div>
      <div class="auth-link">已有账号？<a id="go-login">立即登录</a></div>
    `;

    page.appendChild(card);
    app.appendChild(page);

    const userInput = Utils.id('reg-user');
    const passInput = Utils.id('reg-pass');
    const pass2Input = Utils.id('reg-pass2');
    const btn = Utils.id('reg-btn');
    const errorEl = Utils.id('reg-error');

    const doRegister = async () => {
      const username = userInput.value.trim();
      const password = passInput.value;
      const password2 = pass2Input.value;

      if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        return;
      }
      if (username.length < 2 || username.length > 20) {
        errorEl.textContent = '用户名需要2-20个字符';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = '密码至少需要8个字符';
        return;
      }
      if (password !== password2) {
        errorEl.textContent = '两次输入的密码不一致';
        return;
      }

      btn.disabled = true;
      btn.textContent = '注册中...';
      errorEl.textContent = '';

      try {
        await Auth.register(username, password);
        await Auth.login(username, password);
        Ws.connect();
        window.location.hash = '#/';
      } catch (e) {
        errorEl.textContent = e.message || '注册失败';
      } finally {
        btn.disabled = false;
        btn.textContent = '注册';
      }
    };

    Utils.on(btn, 'click', doRegister);
    Utils.on(pass2Input, 'keydown', e => { if (e.key === 'Enter') doRegister(); });
    Utils.on(Utils.id('go-login'), 'click', () => { window.location.hash = '#/login'; });

    userInput.focus();
  },

  destroy() {},
};
