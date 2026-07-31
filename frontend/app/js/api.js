/* ═══ API Client ═══ */
window.Api = {
  _token: null,

  setToken(token) { this._token = token; },
  clearToken() { this._token = null; },

  async request(apiBase, method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._token) headers['Authorization'] = 'Bearer ' + this._token;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const r = await fetch(apiBase + path, opts);
    const d = await r.json();

    if (r.status === 401) {
      if (window.Auth) Auth.logout();
      throw new Error(d.error || 'unauthorized');
    }

    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  },

  userGet(path) { return this.request(API_CONFIG.userApi, 'GET', path); },
  userPost(path, body) { return this.request(API_CONFIG.userApi, 'POST', path, body); },
  chatGet(path) { return this.request(API_CONFIG.chatApi, 'GET', path); },
  chatPost(path, body) { return this.request(API_CONFIG.chatApi, 'POST', path, body); },
  chatDelete(path) { return this.request(API_CONFIG.chatApi, 'DELETE', path); },
};
