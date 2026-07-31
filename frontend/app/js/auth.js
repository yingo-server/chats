/* ═══ Auth ═══ */
window.Auth = {
  state: { token: '', perm: '', userId: '', userName: '' },

  init() {
    const saved = Utils.store.get('y_auth');
    if (saved && saved.token) {
      this.state = saved;
      Api.setToken(saved.token);
    }
  },

  save() { Utils.store.set('y_auth', this.state); },
  clear() { Utils.store.remove('y_auth'); },
  isLoggedIn() { return !!this.state.token; },
  isAdmin() { return this.state.perm === 'admin'; },

  async login(username, password) {
    const d = await Api.request(API_CONFIG.chatApi, 'POST', '/api/v1/login', { username, password });
    this.state = {
      token: d.long_token,
      perm: d.permission,
      userId: d.user_id,
      userName: username,
    };
    Api.setToken(d.long_token);
    this.save();
    return d;
  },

  async register(username, password) {
    const d = await Api.request(API_CONFIG.userApi, 'POST', '/api/v1/register', { username, password, app_id: 'chat' });
    return d;
  },

  logout() {
    this.state = { token: '', perm: '', userId: '', userName: '' };
    Api.clearToken();
    this.clear();
    if (window.Ws) Ws.disconnect();
    window.location.hash = '#/login';
  },
};
