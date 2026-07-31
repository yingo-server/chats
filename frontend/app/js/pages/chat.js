/* ═══ Chat Page ═══ */
window.ChatPage = {
  _roomId: null,
  _cursor: null,
  _hasMore: true,
  _messages: [],
  _room: null,
  _scrollHandler: null,
  _msgHandler: null,

  mount(roomId) {
    this._roomId = roomId;
    this._cursor = null;
    this._hasMore = true;
    this._messages = [];
    this._room = null;

    App.state.currentRoomId = roomId;
    this._render();
    this._loadRoom();
    this._loadMessages();
    Ws.joinRoom(roomId);

    // Remove old handler if any
    if (this._msgHandler) Ws.offMessage(this._msgHandler);
    this._msgHandler = (msg) => {
      if (msg.roomId === this._roomId) {
        this._appendMessage(msg);
      }
    };
    Ws.onMessage(this._msgHandler);
  },

  _render() {
    const main = Utils.id('main');
    if (!main) return;
    main.innerHTML = '';

    // Header
    const header = Utils.create('div', { className: 'chat-header' });

    const backBtn = Utils.create('button', { className: 'icon-btn chat-header-back' },
      Utils.icon('arrow_back'));
    Utils.on(backBtn, 'click', () => { window.location.hash = '#/'; });
    header.appendChild(backBtn);

    const titleArea = Utils.create('div', { style: { flex: '1', minWidth: '0' } });
    titleArea.innerHTML = `<div class="chat-header-title" id="chat-title">加载中...</div>`;
    header.appendChild(titleArea);

    const actions = Utils.create('div', { className: 'chat-header-actions' });
    const menuBtn = Utils.create('button', { className: 'icon-btn' }, Utils.icon('more_vert'));
    Utils.on(menuBtn, 'click', () => this._showMenu());
    actions.appendChild(menuBtn);
    header.appendChild(actions);

    // Messages
    const messages = Utils.create('div', { className: 'messages-container', id: 'messages-container' });
    messages.innerHTML = '<div class="loading"><span class="material-symbols-outlined">progress_activity</span>加载中...</div>';

    // Input
    const inputBar = Utils.create('div', { className: 'chat-input' });
    inputBar.innerHTML = `
      <div class="chat-input-actions">
        <button class="icon-btn" title="表情"><span class="material-symbols-outlined">emoji_emotions</span></button>
        <button class="icon-btn" title="附件"><span class="material-symbols-outlined">attach_file</span></button>
      </div>
      <textarea id="chat-input" class="chat-input-field" placeholder="输入消息..." rows="1"></textarea>
      <button id="send-btn" class="icon-btn" style="color:var(--accent)"><span class="material-symbols-outlined">send</span></button>
    `;

    main.appendChild(header);
    main.appendChild(messages);
    main.appendChild(inputBar);

    // Input events
    const input = Utils.id('chat-input');
    const sendBtn = Utils.id('send-btn');

    Utils.on(sendBtn, 'click', () => this._send());

    Utils.on(input, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    // Auto resize textarea
    Utils.on(input, 'input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Scroll to top for loading more
    this._scrollHandler = () => {
      if (messages.scrollTop < 50 && this._hasMore && this._cursor) {
        this._loadMore();
      }
    };
    Utils.on(messages, 'scroll', this._scrollHandler);

    // Emoji placeholder
    const emojiBtns = inputBar.querySelectorAll('.chat-input-actions .icon-btn');
    Utils.on(emojiBtns[0], 'click', () => Toast.show('表情功能开发中', 'info'));
    Utils.on(emojiBtns[1], 'click', () => Toast.show('文件上传功能开发中', 'info'));

    input.focus();
  },

  async _loadRoom() {
    try {
      const d = await Api.chatGet('/api/v1/rooms/' + this._roomId);
      this._room = d.room;
      this._updateTitle();
    } catch (e) {
      const title = Utils.id('chat-title');
      if (title) title.textContent = '加载失败';
    }
  },

  _updateTitle() {
    const title = Utils.id('chat-title');
    if (!title || !this._room) return;
    const name = this._getRoomName();
    title.textContent = name;
    if (this._room.type === 'group') {
      title.innerHTML += `<span class="chat-header-sub"> (${this._room.memberIds.length}人)</span>`;
    }
  },

  _getRoomName() {
    if (!this._room) return '聊天';
    if (this._room.name) return this._room.name;
    if (this._room.type === 'direct') {
      const otherId = this._room.memberIds.find(id => id !== Auth.state.userId);
      return otherId || '私聊';
    }
    return '群聊';
  },

  async _loadMessages() {
    const container = Utils.id('messages-container');
    if (!container) return;

    try {
      const d = await Api.chatGet('/api/v1/rooms/' + this._roomId + '/messages?limit=30');
      this._messages = d.items || [];
      this._cursor = d.cursor;
      this._hasMore = d.hasMore;

      container.innerHTML = '';

      if (this._messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无消息</p><p>发送第一条消息开始对话</p></div>';
        return;
      }

      // Messages are sorted newest first, we want to display oldest first
      const sorted = [...this._messages].reverse();
      sorted.forEach(msg => container.appendChild(this._renderBubble(msg)));

      this._scrollToBottom(false);
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><p>加载失败: ' + Utils.esc(e.message) + '</p></div>';
    }
  },

  async _loadMore() {
    if (!this._cursor || !this._hasMore) return;

    const container = Utils.id('messages-container');
    if (!container) return;

    const prevHeight = container.scrollHeight;

    try {
      const d = await Api.chatGet('/api/v1/rooms/' + this._roomId + '/messages?cursor=' + this._cursor + '&limit=20');
      const newItems = d.items || [];
      this._cursor = d.cursor;
      this._hasMore = d.hasMore;

      if (newItems.length === 0) return;

      this._messages = [...this._messages, ...newItems];

      // Insert at top
      const fragment = document.createDocumentFragment();
      newItems.reverse().forEach(msg => fragment.appendChild(this._renderBubble(msg)));

      container.insertBefore(fragment, container.firstChild);

      // Maintain scroll position
      container.scrollTop = container.scrollHeight - prevHeight;
    } catch (e) {
      Toast.show('加载更多失败', 'error');
    }
  },

  _renderBubble(msg) {
    const isMine = msg.senderId === Auth.state.userId;
    const isSystem = msg.type === 'system';

    if (isSystem) {
      const el = Utils.create('div', { className: 'msg-system', text: msg.content });
      return el;
    }

    const wrapper = Utils.create('div', { className: 'msg ' + (isMine ? 'msg-mine' : 'msg-other') });

    if (!isMine) {
      const initial = (msg.senderName || '?').charAt(0).toUpperCase();
      const avatar = Utils.create('div', { className: 'avatar avatar-sm', text: initial });
      wrapper.appendChild(avatar);
    }

    const body = Utils.create('div', { className: 'msg-body' });

    if (!isMine && this._room && this._room.type === 'group') {
      const sender = Utils.create('div', { className: 'msg-sender', text: msg.senderName || msg.senderId });
      body.appendChild(sender);
    }

    const bubble = Utils.create('div', { className: 'msg-bubble', text: msg.content || '' });
    body.appendChild(bubble);

    const time = Utils.create('div', { className: 'msg-time', text: Utils.timeAgo(msg.sentAt) });
    body.appendChild(time);

    wrapper.appendChild(body);
    return wrapper;
  },

  _appendMessage(msg) {
    const container = Utils.id('messages-container');
    if (!container) return;

    // Remove empty state if present
    const empty = container.querySelector('.empty-state');
    if (empty) empty.remove();

    this._messages.push(msg);

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    container.appendChild(this._renderBubble(msg));

    if (wasAtBottom) {
      this._scrollToBottom(true);
    }
  },

  _scrollToBottom(smooth) {
    const container = Utils.id('messages-container');
    if (!container) return;
    setTimeout(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      });
    }, 50);
  },

  _send() {
    const input = Utils.id('chat-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    input.style.height = 'auto';

    Ws.sendMessage(this._roomId, content, 'text', (res) => {
      if (!res || !res.ok) {
        Toast.show(res ? res.error : '发送失败', 'error');
      }
    });
  },

  _showMenu() {
    if (!this._room) return;

    const overlay = Utils.create('div', { className: 'modal-overlay' });
    const modal = Utils.create('div', { className: 'modal' });

    let membersHtml = '';
    if (this._room.type === 'group') {
      membersHtml = `
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-light)">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">成员 (${this._room.memberIds.length})</div>
          <div style="font-size:13px;color:var(--text-primary)">${this._room.memberIds.join(', ')}</div>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="modal-header">
        <span>会话信息</span>
        <button class="icon-btn modal-close">${Utils.icon('close').outerHTML}</button>
      </div>
      <div class="modal-body">
        <div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
          <div style="font-size:12px;color:var(--text-secondary)">名称</div>
          <div style="font-size:14px;margin-top:4px">${Utils.esc(this._getRoomName())}</div>
        </div>
        <div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
          <div style="font-size:12px;color:var(--text-secondary)">类型</div>
          <div style="font-size:14px;margin-top:4px">${this._room.type === 'group' ? '群聊' : '私聊'}</div>
        </div>
        <div style="padding:12px 0">
          <div style="font-size:12px;color:var(--text-secondary)">房间ID</div>
          <div style="font-size:13px;margin-top:4px;font-family:var(--font-mono)">${Utils.esc(this._room.id)}</div>
        </div>
        ${membersHtml}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-close">关闭</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.modal-close').forEach(btn => {
      Utils.on(btn, 'click', () => overlay.remove());
    });

    Utils.on(overlay, 'click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  },

  destroy() {
    if (this._roomId) Ws.leaveRoom(this._roomId);
    if (this._msgHandler) Ws.offMessage(this._msgHandler);
    this._roomId = null;
    this._messages = [];
    this._room = null;
    this._msgHandler = null;
    App.state.currentRoomId = null;
  },
};
