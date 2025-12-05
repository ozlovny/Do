console.log('Скрипт загрузился!');

const API_URL = 'https://backends-production-4dcf.up.railway.app';

// Работа с куками
const Cookies = {
  set(name, value, days = 7) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  },
  
  get(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  },
  
  delete(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
  }
};

let state = {
  screen: 'login',
  phoneNumber: '',
  code: '',
  sessionId: null,
  currentPhone: null,
  username: null,
  activeTab: 'chats',
  chats: [],
  selectedChat: null,
  messages: [],
  messageText: '',
  searchQuery: '',
  searchResults: [],
  error: ''
};

let ws = null;
let pollInterval = null;

// Проверка сохраненной сессии при загрузке
function checkSavedSession() {
  const savedSessionId = Cookies.get('sessionId');
  const savedPhone = Cookies.get('phoneNumber');
  const savedUsername = Cookies.get('username');
  
  if (savedSessionId && savedPhone) {
    state.sessionId = savedSessionId;
    state.currentPhone = savedPhone;
    state.username = savedUsername;
    
    // Проверяем валидность сессии
    fetch(`${API_URL}/api/chats?sessionId=${savedSessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.chats) {
          state.screen = savedUsername ? 'messenger' : 'set-username';
          initMessenger();
          render();
        } else {
          Cookies.delete('sessionId');
          Cookies.delete('phoneNumber');
          Cookies.delete('username');
          render();
        }
      })
      .catch(() => {
        Cookies.delete('sessionId');
        Cookies.delete('phoneNumber');
        Cookies.delete('username');
        render();
      });
  } else {
    render();
  }
}

function render() {
  const root = document.getElementById('root');
  
  if (state.screen === 'login') {
    renderLogin(root);
  } else if (state.screen === 'verify') {
    renderVerify(root);
  } else if (state.screen === 'set-username') {
    renderSetUsername(root);
  } else if (state.screen === 'messenger') {
    renderMessenger(root);
  }
}

function renderLogin(root) {
  root.innerHTML = `
    <div class="container">
      <div class="icon">💬</div>
      <h1>Мессенджер</h1>
      <p>Войдите в свой аккаунт</p>
      ${state.error ? `<div class="error">${state.error}</div>` : ''}
      <label>Номер телефона</label>
      <input 
        type="text" 
        id="phoneInput" 
        placeholder="+375000 или +375001"
        value="${state.phoneNumber}"
      >
      <button onclick="checkPhone()">Продолжить</button>
      <div class="hint">Зарегистрированные номера: +375000, +375001</div>
    </div>
  `;
  
  const input = document.getElementById('phoneInput');
  input.addEventListener('input', (e) => {
    state.phoneNumber = e.target.value;
  });
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPhone();
  });
  input.focus();
}

function renderVerify(root) {
  root.innerHTML = `
    <div class="container">
      <h1>Введите код</h1>
      <p>Код отправлен на номер ${state.phoneNumber}</p>
      <p style="font-size: 13px; color: #e53e3e;">Проверьте логи сервера для получения кода!</p>
      ${state.error ? `<div class="error">${state.error}</div>` : ''}
      <input 
        type="text" 
        id="codeInput" 
        placeholder="Введите 5-значный код"
        maxlength="5"
        style="text-align: center; font-size: 24px; letter-spacing: 8px;"
        value="${state.code}"
      >
      <button onclick="verifyCode()">Подтвердить</button>
      <button class="back-btn" onclick="goBack()">Назад</button>
    </div>
  `;
  
  const input = document.getElementById('codeInput');
  input.addEventListener('input', (e) => {
    state.code = e.target.value;
  });
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyCode();
  });
  input.focus();
}

function renderSetUsername(root) {
  root.innerHTML = `
    <div class="container">
      <div class="icon">👤</div>
      <h1>Установите username</h1>
      <p>Выберите уникальное имя пользователя</p>
      <p style="font-size: 13px; color: #e53e3e; margin-top: -20px;">⚠️ Username нельзя изменить после установки!</p>
      ${state.error ? `<div class="error">${state.error}</div>` : ''}
      <label>Username</label>
      <input 
        type="text" 
        id="usernameInput" 
        placeholder="Например: user123"
        maxlength="20"
      >
      <button onclick="setUsername()">Сохранить</button>
      <div class="hint">
        • От 3 до 20 символов<br>
        • Только буквы, цифры и _<br>
        • Устанавливается один раз
      </div>
    </div>
  `;
  
  const input = document.getElementById('usernameInput');
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setUsername();
  });
  input.focus();
}

function renderMessenger(root) {
  root.innerHTML = `
    <div class="chat-container">
      <div class="header">
        <div class="header-left">
          <span>💬</span>
          <span>Мессенджер</span>
        </div>
        <div class="header-right">
          <span><strong>${state.username || state.currentPhone}</strong> (${state.currentPhone})</span>
          <button class="logout-btn" onclick="logout()" title="Выйти">🚪</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="sidebar">
          <div class="tabs">
            <button class="tab ${state.activeTab === 'chats' ? 'active' : ''}" onclick="switchTab('chats')">
              Чаты
            </button>
            <button class="tab ${state.activeTab === 'search' ? 'active' : ''}" onclick="switchTab('search')">
              Поиск
            </button>
            <button class="tab ${state.activeTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')">
              Настройки
            </button>
          </div>
          
          <div id="tabContent"></div>
        </div>
        
        <div class="chat-area" id="chatArea"></div>
      </div>
    </div>
  `;

  renderTabContent();
  renderChatArea();
}

function renderTabContent() {
  const content = document.getElementById('tabContent');
  
  if (state.activeTab === 'chats') {
    if (state.chats.length === 0) {
      content.innerHTML = '<div class="chat-list"><div style="padding: 40px; text-align: center; color: #cbd5e0;">Нет чатов<br><small>Используйте поиск для начала общения</small></div></div>';
    } else {
      content.innerHTML = `
        <div class="chat-list">
          ${state.chats.map(chat => `
            <div class="chat-item ${state.selectedChat === chat.phoneNumber ? 'active' : ''}" onclick="selectChat('${chat.phoneNumber}')">
              <div class="avatar">${chat.username ? chat.username[0].toUpperCase() : chat.phoneNumber.slice(-3)}</div>
              <div class="chat-info">
                <div class="chat-name">${chat.username || chat.phoneNumber}</div>
                ${chat.username ? `<div class="chat-phone">${chat.phoneNumber}</div>` : ''}
                ${chat.lastMessage ? `<div class="chat-preview">${chat.lastMessage.text}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else if (state.activeTab === 'search') {
    content.innerHTML = `
      <div class="search-container">
        <div class="search-input-wrapper">
          <input 
            type="text" 
            id="searchInput"
            placeholder="Поиск по номеру или username..."
            value="${state.searchQuery}"
            class="search-input"
          >
        </div>
        <div id="searchResults"></div>
      </div>
    `;
    
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery.length > 0) {
        performSearch();
      } else {
        document.getElementById('searchResults').innerHTML = '<div style="padding: 40px; text-align: center; color: #cbd5e0;">Введите номер или username</div>';
      }
    });
    searchInput.focus();
    
    if (state.searchQuery) {
      performSearch();
    } else {
      document.getElementById('searchResults').innerHTML = '<div style="padding: 40px; text-align: center; color: #cbd5e0;">Введите номер или username</div>';
    }
  } else {
    content.innerHTML = `
      <div class="settings">
        <h3 style="margin-bottom: 16px; color: #1a202c;">Аккаунт</h3>
        <div class="setting-group">
          <div class="setting-label">Username:</div>
          <div class="setting-value">${state.username || 'Не установлен'}</div>
        </div>
        <div class="setting-group">
          <div class="setting-label">Номер телефона:</div>
          <div class="setting-value">${state.currentPhone}</div>
        </div>
        
        <h3 style="margin-bottom: 16px; margin-top: 24px; color: #1a202c;">О приложении</h3>
        <div class="setting-group">
          <div style="font-size: 14px; color: #718096;">
            <p>Версия: 2.0.0</p>
            <p style="margin-top: 8px;">Мессенджер с поиском пользователей и username</p>
          </div>
        </div>
      </div>
    `;
  }
}

function renderChatArea() {
  const area = document.getElementById('chatArea');
  
  if (!state.selectedChat) {
    area.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>Выберите чат для начала общения</p>
      </div>
    `;
    return;
  }

  const chat = state.chats.find(c => c.phoneNumber === state.selectedChat);
  const displayName = chat?.username || state.selectedChat;

  area.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${chat?.username ? chat.username[0].toUpperCase() : state.selectedChat.slice(-3)}</div>
      <div>
        <div class="chat-title">${displayName}</div>
        ${chat?.username ? `<div class="chat-status">${state.selectedChat}</div>` : '<div class="chat-status">в сети</div>'}
      </div>
    </div>
    
    <div class="messages" id="messagesList">
      ${state.messages.map(msg => {
        const isOwn = msg.from === state.currentPhone;
        return `
          <div class="message ${isOwn ? 'own' : ''}">
            <div class="message-bubble">
              <div class="message-text">${escapeHtml(msg.text)}</div>
              <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="message-input">
      <div class="input-wrapper">
        <input 
          type="text" 
          id="messageInput" 
          placeholder="Введите сообщение..."
          value="${state.messageText}"
        >
        <button class="send-btn" onclick="sendMessage()">➤</button>
      </div>
    </div>
  `;

  const input = document.getElementById('messageInput');
  input.addEventListener('input', (e) => {
    state.messageText = e.target.value;
  });
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  scrollToBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  setTimeout(() => {
    const messages = document.getElementById('messagesList');
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  }, 100);
}

async function checkPhone() {
  state.error = '';
  try {
    const res = await fetch(`${API_URL}/api/auth/check-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: state.phoneNumber })
    });
    
    const data = await res.json();
    
    if (data.registered) {
      state.screen = 'verify';
      state.code = '';
    } else {
      state.error = 'Номер не зарегистрирован';
    }
  } catch (err) {
    state.error = 'Ошибка подключения к серверу. Проверьте что backend запущен.';
    console.error('Error:', err);
  }
  render();
}

async function verifyCode() {
  state.error = '';
  try {
    const res = await fetch(`${API_URL}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: state.phoneNumber, code: state.code })
    });
    
    const data = await res.json();
    
    if (data.success) {
      state.sessionId = data.sessionId;
      state.currentPhone = data.phoneNumber;
      state.username = data.username;
      
      // Сохраняем в куки
      Cookies.set('sessionId', data.sessionId);
      Cookies.set('phoneNumber', data.phoneNumber);
      if (data.username) {
        Cookies.set('username', data.username);
      }
      
      if (data.username) {
        state.screen = 'messenger';
        initMessenger();
      } else {
        state.screen = 'set-username';
      }
    } else {
      state.error = data.error || 'Неверный код';
    }
  } catch (err) {
    state.error = 'Ошибка подключения к серверу';
    console.error('Error:', err);
  }
  render();
}

async function setUsername() {
  const input = document.getElementById('usernameInput');
  const username = input.value.trim();
  
  if (!username) {
    state.error = 'Введите username';
    render();
    return;
  }
  
  state.error = '';
  try {
    const res = await fetch(`${API_URL}/api/user/set-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId, username })
    });
    
    const data = await res.json();
    
    if (data.success) {
      state.username = username;
      Cookies.set('username', username);
      state.screen = 'messenger';
      initMessenger();
      render();
    } else {
      state.error = data.error || 'Ошибка установки username';
      render();
    }
  } catch (err) {
    state.error = 'Ошибка подключения к серверу';
    console.error('Error:', err);
    render();
  }
}

function initMessenger() {
  loadChats();
  
  try {
    const wsUrl = API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      ws.send(JSON.stringify({ type: 'register', sessionId: state.sessionId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'newMessage' || data.type === 'messageSent') {
        if (state.selectedChat === data.message.from || state.selectedChat === data.message.to) {
          state.messages.push(data.message);
          renderChatArea();
        }
        loadChats();
      }
    };
  } catch (err) {
    console.error('WebSocket error:', err);
  }

  pollInterval = setInterval(() => {
    if (state.selectedChat) {
      loadMessages(state.selectedChat, true);
    }
    loadChats();
  }, 3000);
}

async function loadChats() {
  try {
    const res = await fetch(`${API_URL}/api/chats?sessionId=${state.sessionId}`);
    const data = await res.json();
    state.chats = data.chats || [];
    if (state.screen === 'messenger' && state.activeTab === 'chats') {
      renderTabContent();
    }
  } catch (err) {
    console.error('Error loading chats:', err);
  }
}

async function performSearch() {
  try {
    const res = await fetch(`${API_URL}/api/users/search?sessionId=${state.sessionId}&query=${encodeURIComponent(state.searchQuery)}`);
    const data = await res.json();
    state.searchResults = data.users || [];
    
    const resultsDiv = document.getElementById('searchResults');
    if (state.searchResults.length === 0) {
      resultsDiv.innerHTML = '<div style="padding: 40px; text-align: center; color: #cbd5e0;">Пользователи не найдены</div>';
    } else {
      resultsDiv.innerHTML = `
        <div class="chat-list">
          ${state.searchResults.map(user => `
            <div class="chat-item" onclick="selectChat('${user.phoneNumber}')">
              <div class="avatar">${user.username ? user.username[0].toUpperCase() : user.phoneNumber.slice(-3)}</div>
              <div class="chat-info">
                <div class="chat-name">${user.username || user.phoneNumber}</div>
                ${user.username ? `<div class="chat-phone">${user.phoneNumber}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (err) {
    console.error('Error searching:', err);
  }
}

async function loadMessages(phone, silent = false) {
  if (!state.sessionId) return;
  try {
    const res = await fetch(`${API_URL}/api/messages?sessionId=${state.sessionId}&withPhone=${phone}`);
    const data = await res.json();
    
    if (!silent) {
      state.messages = data.messages || [];
      state.selectedChat = phone;
      state.activeTab = 'chats';
      renderTabContent();
      renderChatArea();
    } else {
      const currentIds = new Set(state.messages.map(m => m.id));
      const newMessages = (data.messages || []).filter(m => !currentIds.has(m.id));
      if (newMessages.length > 0) {
        state.messages.push(...newMessages);
        renderChatArea();
      }
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

async function sendMessage() {
  if (!state.messageText.trim() || !state.selectedChat) return;

  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'sendMessage',
        to: state.selectedChat,
        text: state.messageText,
        sessionId: state.sessionId
      }));
    } else {
      const message = {
        id: `msg_${Date.now()}_${Math.random()}`,
        from: state.currentPhone,
        to: state.selectedChat,
        text: state.messageText,
        timestamp: new Date().toISOString()
      };
      state.messages.push(message);
    }
    
    state.messageText = '';
    renderChatArea();
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

function goBack() {
  state.screen = 'login';
  state.error = '';
  render();
}

function logout() {
  if (ws) ws.close();
  if (pollInterval) clearInterval(pollInterval);
  
  Cookies.delete('sessionId');
  Cookies.delete('phoneNumber');
  Cookies.delete('username');
  
  state = {
    screen: 'login',
    phoneNumber: '',
    code: '',
    sessionId: null,
    currentPhone: null,
    username: null,
    activeTab: 'chats',
    chats: [],
    selectedChat: null,
    messages: [],
    messageText: '',
    searchQuery: '',
    searchResults: [],
    error: ''
  };
  
  render();
}

function switchTab(tab) {
  state.activeTab = tab;
  if (tab === 'chats') {
    state.searchQuery = '';
  }
  renderTabContent();
}

function selectChat(phone) {
  loadMessages(phone);
}

console.log('Запуск приложения...');
checkSavedSession();
