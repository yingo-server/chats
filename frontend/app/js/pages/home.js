/* ═══ Home Page: Room List ═══ */
window.HomePage = {
  _rooms: [],
  _filter: '',

  mount() {
    this._rooms = [];
    this._filter = '';
    this._render();
    this._loadRooms();

    // Update room order on new messages
    this._msgHandler = (msg) => {
      const room = this._rooms.find(r => r.id === msg.roomId);
      if (room) {
        this._rooms = this._rooms.filter(r => r.id !== msg.roomId);
        this._rooms.unshift(room);
        this._renderList();
      }
    };
    Ws.onMessage(this._msgHandler);
  },

  _render() {
    const app = Utils.id('app');
    app.innerHTML = '';

    const sidebar = Utils.create('div', { id: 'sidebar' });

    // Header
    const header = Utils.create('div', { id: 'sidebar-header' });
    header.innerHTML = `<h1>Yingo</h1>`;
    const profileBtn = Utils.create('button', { className: 'icon-btn', title: '我的资料' },
      Utils.icon('person'));
    Utils.on(profileBtn, 'click', () => { window.location.hash = '#/profile/' + Auth.state.userId; });
    header.appendChild(profileBtn);
    sidebar.appendChild(header);

    // Search
    const search = Utils.create('div', { id: 'sidebar-search' });
    search.innerHTML = `
      <div class="search-box">
        <span class="material-symbols-outlined">search</span>
        <input id="room-search" type="text" placeholder="搜索会话...">
      </div>
    `;
    sidebar.appendChild(search);

    // Room list
    const roomList = Utils.create('div', { id: 'room-list' });
    roomList.innerHTML = '<div class="loading"><span class="material-symbols-outlined">progress_activity</span>加载中...</div>';
    sidebar.appendChild(roomList);

    // Footer - create button
    const footer = Utils.create('div', { id: 'sidebar-footer' });
    const createBtn = Utils.create('button', { className: 'room-create-btn' });
    createBtn.innerHTML = '<span class="material-symbols-outlined">add</span>新建会话';
    Utils.on(createBtn, 'click', () => { window.location.hash = '#/create'; });
    footer.appendChild(createBtn);
    sidebar.appendChild(footer);

    // Main area
    const main = Utils.create('div', { id: 'main' });
    const content = Utils.create('div', { id: 'content' });
    content.innerHTML = `
      <div class="welcome-page">
        <span class="material-symbols-outlined">forum</span>
        <p>选择一个会话开始聊天</p>
      </div>
    `;
    main.appendChild(content);

    // Bottom nav (mobile)
    const bottomNav = Utils.create('div', { id: 'bottom-nav' });
    bottomNav.innerHTML = `
      <div class="bottom-nav-items">
        <div class="bottom-nav-item active">
          <span class="material-symbols-outlined">chat</span>
          <span>消息</span>
        </div>
        <div class="bottom-nav-item" id="nav-contacts">
          <span class="material-symbols-outlined">people</span>
          <span>联系人</span>
        </div>
        <div class="bottom-nav-item" id="nav-settings">
          <span class="material-symbols-outlined">settings</span>
          <span>设置</span>
        </div>
      </div>
    `;
    main.appendChild(bottomNav);

    app.appendChild(sidebar);
    app.appendChild(main);

    // Events
    Utils.on(Utils.id('room-search'), 'input', (e) => {
      this._filter = e.target.value.trim().toLowerCase();
      this._renderList();
    });

    Utils.on(Utils.id('nav-settings'), 'click', () => {
      window.location.hash = '#/profile/' + Auth.state.userId;
    });

    Utils.on(Utils.id('nav-contacts'), 'click', () => {
      Toast.show('联系人功能开发中', 'info');
    });
  },

  async _loadRooms() {
    try {
      const d = await Api.chatGet('/api/v1/rooms');
      this._rooms = d.rooms || [];
      this._renderList();
    } catch (e) {
      const list = Utils.id('room-list');
      if (list) list.innerHTML = '<div class="empty-state"><p>加载失败: ' + Utils.esc(e.message) + '</p></div>';
    }
  },

  _renderList() {
    const list = Utils.id('room-list');
    if (!list) return;

    const rooms = this._rooms.filter(r => {
      if (!this._filter) return true;
      const name = this._getRoomName(r).toLowerCase();
      return name.includes(this._filter);
    });

    if (rooms.length === 0) {
      list.innerHTML = this._filter
        ? '<div class="empty-state"><p>没有匹配的会话</p></div>'
        : '<div class="empty-state"><p>暂无会话</p><p>点击下方"新建会话"开始</p></div>';
      return;
    }

    list.innerHTML = '';
    rooms.forEach(room => {
      const item = this._renderRoomItem(room);
      list.appendChild(item);
    });
  },

  _renderRoomItem(room) {
    const item = Utils.create('div', { className: 'room-item' });
    if (App.state.currentRoomId === room.id) item.classList.add('active');

    const name = this._getRoomName(room);
    const initial = name.charAt(0).toUpperCase();
    const isGroup = room.type === 'group';

    const avatar = Utils.create('div', { className: 'avatar avatar-md', text: initial });
    if (isGroup) avatar.style.background = '#6366f1';

    const info = Utils.create('div', { className: 'room-info' });
    info.innerHTML = `
      <div class="room-name">${Utils.esc(name)}</div>
      <div class="room-last">${isGroup ? '<span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">group</span> ' + room.memberIds.length + '人' : ''}</div>
    `;

    const meta = Utils.create('div', { className: 'room-meta' });

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(meta);

    Utils.on(item, 'click', () => {
      window.location.hash = '#/chat/' + room.id;
    });

    return item;
  },

  _getRoomName(room) {
    if (room.name) return room.name;
    if (room.type === 'direct') {
      const otherId = room.memberIds.find(id => id !== Auth.state.userId);
      return otherId ? otherId : '私聊';
    }
    return '群聊';
  },

  setActiveRoom(roomId) {
    App.state.currentRoomId = roomId;
    Utils.$$('.room-item').forEach(el => el.classList.remove('active'));
  },

  destroy() {
    if (this._msgHandler) Ws.offMessage(this._msgHandler);
    this._msgHandler = null;
  },
};
