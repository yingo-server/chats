/* ═══ Create Room Page ═══ */
window.CreatePage = {
  _type: 'direct',
  _memberIds: [],

  mount() {
    this._type = 'direct';
    this._memberIds = [];
    this._render();
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
    header.appendChild(Utils.create('h2', { text: '新建会话' }));
    page.appendChild(header);

    // Body
    const body = Utils.create('div', { className: 'create-body' });

    // Type tabs
    const tabs = Utils.create('div', { className: 'create-tabs' });
    const directTab = Utils.create('div', { className: 'create-tab active', text: '私聊' });
    const groupTab = Utils.create('div', { className: 'create-tab', text: '群聊' });
    tabs.appendChild(directTab);
    tabs.appendChild(groupTab);
    body.appendChild(tabs);

    // Forms container
    const forms = Utils.create('div', { id: 'create-forms' });
    body.appendChild(forms);

    // Result
    body.innerHTML += '<div id="create-result" class="auth-error" style="margin-top:16px"></div>';

    page.appendChild(body);
    app.appendChild(page);

    // Tab events
    Utils.on(directTab, 'click', () => {
      this._type = 'direct';
      directTab.classList.add('active');
      groupTab.classList.remove('active');
      this._renderForm();
    });

    Utils.on(groupTab, 'click', () => {
      this._type = 'group';
      groupTab.classList.add('active');
      directTab.classList.remove('active');
      this._renderForm();
    });

    this._renderForm();
  },

  _renderForm() {
    const forms = Utils.id('create-forms');
    if (!forms) return;
    forms.innerHTML = '';

    if (this._type === 'direct') {
      forms.innerHTML = `
        <div class="input-group" style="margin-top:20px">
          <label>对方用户ID</label>
          <input id="target-id" class="input" type="text" placeholder="输入用户ID">
        </div>
        <button id="create-direct-btn" class="btn btn-primary btn-block" style="margin-top:12px">创建私聊</button>
      `;
      const btn = Utils.id('create-direct-btn');
      const input = Utils.id('target-id');
      Utils.on(btn, 'click', () => this._createDirect());
      Utils.on(input, 'keydown', (e) => { if (e.key === 'Enter') this._createDirect(); });
      input.focus();
    } else {
      forms.innerHTML = `
        <div class="input-group" style="margin-top:20px">
          <label>群聊名称</label>
          <input id="group-name" class="input" type="text" placeholder="输入群聊名称">
        </div>
        <div class="input-group">
          <label>添加成员</label>
          <input id="member-input" class="input" type="text" placeholder="输入用户ID，回车添加">
        </div>
        <div id="member-tags" class="member-tags"></div>
        <button id="create-group-btn" class="btn btn-primary btn-block" style="margin-top:16px">创建群聊</button>
      `;

      const memberInput = Utils.id('member-input');
      Utils.on(memberInput, 'keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._addMember(memberInput.value.trim());
          memberInput.value = '';
        }
      });

      Utils.on(Utils.id('create-group-btn'), 'click', () => this._createGroup());
      Utils.id('group-name').focus();
    }
  },

  _addMember(userId) {
    if (!userId || this._memberIds.includes(userId)) return;
    if (userId === Auth.state.userId) {
      Toast.show('不能添加自己', 'error');
      return;
    }
    this._memberIds.push(userId);
    this._renderMemberTags();
  },

  _removeMember(userId) {
    this._memberIds = this._memberIds.filter(id => id !== userId);
    this._renderMemberTags();
  },

  _renderMemberTags() {
    const container = Utils.id('member-tags');
    if (!container) return;
    container.innerHTML = '';
    this._memberIds.forEach(id => {
      const tag = Utils.create('span', { className: 'member-tag' });
      tag.innerHTML = Utils.esc(id) + ' <span class="material-symbols-outlined remove" style="font-size:14px">close</span>';
      Utils.on(tag.querySelector('.remove'), 'click', () => this._removeMember(id));
      container.appendChild(tag);
    });
  },

  async _createDirect() {
    const targetId = Utils.id('target-id')?.value.trim();
    if (!targetId) {
      this._showResult('请输入对方用户ID');
      return;
    }

    const btn = Utils.id('create-direct-btn');
    btn.disabled = true;
    btn.textContent = '创建中...';

    try {
      const d = await Api.chatPost('/api/v1/rooms/direct', { targetUserId: targetId });
      Toast.show('私聊创建成功', 'success');
      window.location.hash = '#/chat/' + d.room.id;
    } catch (e) {
      this._showResult(e.message);
      btn.disabled = false;
      btn.textContent = '创建私聊';
    }
  },

  async _createGroup() {
    const name = Utils.id('group-name')?.value.trim();
    if (!name) {
      this._showResult('请输入群聊名称');
      return;
    }

    const btn = Utils.id('create-group-btn');
    btn.disabled = true;
    btn.textContent = '创建中...';

    try {
      const d = await Api.chatPost('/api/v1/rooms/group', { name, memberIds: this._memberIds });
      Toast.show('群聊创建成功', 'success');
      window.location.hash = '#/chat/' + d.room.id;
    } catch (e) {
      this._showResult(e.message);
      btn.disabled = false;
      btn.textContent = '创建群聊';
    }
  },

  _showResult(msg) {
    const el = Utils.id('create-result');
    if (el) el.textContent = msg;
  },

  destroy() {},
};
