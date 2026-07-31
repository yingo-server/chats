/* ═══ Profile Page ═══ */
window.ProfilePage = {
  _userId: null,

  mount(userId) {
    this._userId = userId || Auth.state.userId;
    this._render();
    this._loadProfile();
  },

  _render() {
    const app = Utils.id('app');
    app.innerHTML = '';

    const page = Utils.create('div', { style: { display: 'flex', flexDirection: 'column', height: '100vh' } });

    // Header
    const header = Utils.create('div', { className: 'page-header' });
    const backBtn = Utils.create('button', { className: 'icon-btn' }, Utils.icon('arrow_back'));
    Utils.on(backBtn, 'click', () => { window.history.back(); });
    header.appendChild(backBtn);
    header.appendChild(Utils.create('h2', { text: '用户资料' }));
    page.appendChild(header);

    // Body
    const body = Utils.create('div', { className: 'profile-body', id: 'profile-body' });
    body.innerHTML = '<div class="loading"><span class="material-symbols-outlined">progress_activity</span>加载中...</div>';
    page.appendChild(body);

    app.appendChild(page);
  },

  async _loadProfile() {
    const body = Utils.id('profile-body');
    if (!body) return;

    try {
      let user;
      if (this._userId === Auth.state.userId) {
        const d = await Api.userGet('/api/v1/users/me');
        user = d.user;
      } else {
        try {
          const d = await Api.userGet('/api/v1/admin/users/' + this._userId);
          user = d.user;
        } catch {
          // Not admin, try basic info
          user = { id: this._userId, globalName: this._userId, permission: 'user', online: false };
        }
      }

      if (!user) {
        body.innerHTML = '<div class="empty-state"><p>用户不存在</p></div>';
        return;
      }

      const initial = (user.globalName || '?').charAt(0).toUpperCase();
      const isMe = this._userId === Auth.state.userId;
      const isAdmin = user.permission === 'admin';

      body.innerHTML = `
        <div class="profile-header">
          <div class="avatar avatar-lg ${user.online ? 'avatar-online' : ''}">${Utils.esc(initial)}</div>
          <div class="profile-name">${Utils.esc(user.globalName)}</div>
          <div class="profile-id">${Utils.esc(user.id)}</div>
          <span class="badge ${user.online ? 'badge-ok' : 'badge-err'}">${user.online ? '在线' : '离线'}</span>
        </div>

        <div class="card">
          <table class="profile-table">
            <tr>
              <td>权限</td>
              <td><span class="badge ${isAdmin ? 'badge-admin' : 'badge-user'}">${isAdmin ? '管理员' : '用户'}</span></td>
            </tr>
            <tr>
              <td>注册时间</td>
              <td>${Utils.timeFull(user.createdAt)}</td>
            </tr>
            <tr>
              <td>最后在线</td>
              <td>${user.lastOnlineAt ? Utils.timeAgo(user.lastOnlineAt) : '-'}</td>
            </tr>
          </table>
        </div>

        <div class="profile-actions" id="profile-actions"></div>
      `;

      const actions = Utils.id('profile-actions');
      if (isMe) {
        const logoutBtn = Utils.create('button', { className: 'btn btn-danger' });
        logoutBtn.innerHTML = Utils.icon('logout').outerHTML + '退出登录';
        Utils.on(logoutBtn, 'click', () => Auth.logout());
        actions.appendChild(logoutBtn);
      } else {
        const msgBtn = Utils.create('button', { className: 'btn btn-primary' });
        msgBtn.innerHTML = Utils.icon('chat').outerHTML + '发消息';
        Utils.on(msgBtn, 'click', () => this._sendMessage());
        actions.appendChild(msgBtn);
      }
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><p>加载失败: ' + Utils.esc(e.message) + '</p></div>';
    }
  },

  async _sendMessage() {
    try {
      const d = await Api.chatPost('/api/v1/rooms/direct', { targetUserId: this._userId });
      window.location.hash = '#/chat/' + d.room.id;
    } catch (e) {
      Toast.show('创建会话失败: ' + e.message, 'error');
    }
  },

  destroy() {},
};
