/* ═══ Socket.IO Wrapper ═══ */
window.Ws = {
  _socket: null,
  _msgHandler: null,
  _onlineHandler: null,

  connect() {
    if (this._socket && this._socket.connected) return;
    if (!Auth.isLoggedIn()) return;

    const url = API_CONFIG.chatApi;
    this._socket = io(url, {
      auth: { token: Auth.state.token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this._socket.on('connect', () => {
      console.log('[Ws] connected');
    });

    this._socket.on('disconnect', (reason) => {
      console.log('[Ws] disconnected:', reason);
    });

    this._socket.on('connect_error', (err) => {
      console.log('[Ws] connection error:', err.message);
    });

    this._socket.on('v1:message', (msg) => {
      if (this._msgHandler) this._msgHandler(msg);
    });

    this._socket.on('v1:online', (data) => {
      if (this._onlineHandler) this._onlineHandler(data);
    });

    this._socket.on('v1:error', (data) => {
      console.log('[Ws] error:', data.message);
    });
  },

  disconnect() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
  },

  emit(event, data, cb) {
    if (this._socket && this._socket.connected) {
      this._socket.emit(event, data, cb);
    }
  },

  on(event, fn) {
    if (this._socket) this._socket.on(event, fn);
  },

  joinRoom(roomId) { this.emit('v1:join', { roomId }); },
  leaveRoom(roomId) { this.emit('v1:leave', { roomId }); },

  sendMessage(roomId, content, type, cb) {
    this.emit('v1:message', { roomId, content, type: type || 'text' }, cb);
  },

  onMessage(fn) { this._msgHandler = fn; },
  offMessage(fn) { if (this._msgHandler === fn) this._msgHandler = null; },
  onOnline(fn) { this._onlineHandler = fn; },
};
