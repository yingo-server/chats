/* ═══ Toast Component ═══ */
window.Toast = {
  _container: null,

  _ensure() {
    if (!this._container) {
      this._container = Utils.create('div', { className: 'toast-container' });
      document.body.appendChild(this._container);
    }
  },

  show(msg, type, duration) {
    this._ensure();
    type = type || 'info';
    duration = duration || 3000;

    const toast = Utils.create('div', { className: 'toast toast-' + type, text: msg });
    this._container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); },
};

/* ═══ Router ═══ */
window.Router = {
  _routes: [],
  _current: null,

  register(pattern, handler) {
    // Convert /chat/:id to regex
    const paramNames = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this._routes.push({ pattern, regex: new RegExp('^' + regexStr + '$'), paramNames, handler });
  },

  navigate(hash) {
    window.location.hash = hash;
  },

  start() {
    window.addEventListener('hashchange', () => this._resolve());
    this._resolve();
  },

  _currentPage: null,

  _resolve() {
    const hash = window.location.hash || '#/';
    const path = hash.slice(1) || '/';

    for (const route of this._routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });

        // Destroy previous page
        if (this._currentPage && this._currentPage.destroy) {
          this._currentPage.destroy();
        }
        this._currentPage = null;

        const page = route.handler(params);
        if (page && page.destroy) this._currentPage = page;
        return;
      }
    }

    // Default to home
    if (path !== '/') {
      Router.navigate('#/');
    }
  },
};

/* ═══ App Main ═══ */
window.App = {
  state: {
    currentRoomId: null,
    rooms: [],
  },

  init() {
    // Init auth
    Auth.init();

    // Register routes
    Router.register('/login', () => { LoginPage.mount(); return LoginPage; });
    Router.register('/register', () => { RegisterPage.mount(); return RegisterPage; });
    Router.register('/', () => {
      if (!Auth.isLoggedIn()) {
        Router.navigate('#/login');
        return;
      }
      HomePage.mount();
      return HomePage;
    });
    Router.register('/chat/:id', (params) => {
      if (!Auth.isLoggedIn()) {
        Router.navigate('#/login');
        return;
      }
      ChatPage.mount(params.id);
      return ChatPage;
    });
    Router.register('/create', () => {
      if (!Auth.isLoggedIn()) {
        Router.navigate('#/login');
        return;
      }
      CreatePage.mount();
      return CreatePage;
    });
    Router.register('/profile/:id', (params) => {
      if (!Auth.isLoggedIn()) {
        Router.navigate('#/login');
        return;
      }
      ProfilePage.mount(params.id);
      return ProfilePage;
    });

    // Connect WS if logged in
    if (Auth.isLoggedIn()) {
      Ws.connect();
    }

    // Start router
    Router.start();
  },
};

/* ═══ Bootstrap ═══ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
