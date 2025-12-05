console.log('Скрипт загрузился!');

// Конфигурация - ЗАМЕНИ НА СВОЙ RAILWAY URL
const API_URL = 'https://backends-production-4dcf.up.railway.app';

console.log('API URL:', API_URL);

// ВАЖНО: Если задеплоил на Railway, измени на:
// const API_URL = 'https://твой-backend.railway.app';

// Проверка что API_URL правильный
if (API_URL.includes('localhost') && window.location.hostname !== 'localhost') {
  console.warn('⚠️ ВНИМАНИЕ: Используется localhost API, но сайт открыт не на localhost!');
  console.warn('Измени API_URL в app.js на свой Railway URL');
}

// Работа с cookies
function setCookie(name, value, days = 7) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
}

function getCookie(name) {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) return value;
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

// Состояние приложения
let state = {
  screen: 'login',
  phoneNumber: '',
  code: '',
  sessionId: null,
  currentPhone: null,
  username: null,
  activeTab: 'chats',
  allUsers: [],
  chats: [],
  selectedChat: null,
  messages: [],
  messageText: '',
  searchQuery: '',
  error: '',
  showUsernameModal: false
};

let ws = null;
let pollInterval = null;

// Проверка сохраненной сессии при загрузке
window.addEventListener('load', () => {
  const savedSession = getCookie('sessionId');
  const savedPhone = getCookie('phoneNumber');
  const savedUsername = getCookie('username');
  
  if (savedSession && savedPhone) {
    console.log('Найдена сохраненная сессия, восстановление...');
    state.sessionId = savedSession;
    state.currentPhone = savedPhone;
    state.username = savedUsername !== 'null' ? savedUsername : null;
    state.screen = 'messenger';
    initMessenger();
    render();
  } else {
    render();
  }
});

function render() {
  const root = document.getElementById('root');
  
  if (state.screen === 'login') {
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
        <div class="hint">Тестовые номера: +375000, +375001</div>
      </div>
    `;
    
    const input = document.getElementById('phoneInput');
    input.addEventListener('input', (e) => {
      state.phoneNumber = e.target.value;
    });
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPhone();
    });
  }
  else if (state.screen === 'verify') {
    root.innerHTML = `
      <div class="container">
        <h1>Введите код</h1>
        <p>Код отправлен на номер ${state.phoneNumber}</p>
        <p style="color: #48bb78; font-weight: 600;">Проверьте консоль сервера (логи backend)</p>
        ${state.error ? `<div class="error">${state.error}</div>` : ''}
        <input 
          type="text" 
          id="codeInput" 
          placeholder="Введите код из логов"
          maxlength="5"
          style="text-align: center; font-size: 24px; letter-spacing: 8px;"
          value="${state.code}"
        >
        <button onclick="verifyCode()">Подтвердить</button>
        <button class="back-btn" onclick="goBack()">Назад</button>
        <div class="hint">Код находится в консоли backend сервера</div>
      </div>
    `;
    
    const input = document.getElementById('codeInput');
    input.addEventListener('input', (e) => {
      state.code = e.target.value;
    });
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyCode();
    });
  }
  else if (state.screen === 'messenger') {
    renderMessenger();
  }
}

function renderMessenger() {
  const root = document.getElementById('root');
  
  root.innerHTML = `
    <div class="chat-container">
      <div class="header">
        <div class="header-left">
          <span>💬</span>
          <span>Мессенджер</span>
        </div>
        <div class="header-right">
          <span class="user-info">
            ${state.username ? `@${state.username}` : state.currentPhone}
            ${!state.username ? '<button class="set-username-btn" onclick="showUsernameModal()">✏️</button>' : ''}
          </span>
          <button class="logout-btn" onclick="logout()">🚪</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="sidebar">
          <div class="tabs">
            <button class="tab ${state.activeTab === 'chats' ? 'active' : ''}" onclick="switchTab('chats')">
              Чаты
            </button>
            <button class="tab ${state.activeTab === 'users' ? 'active' : ''}" onclick="switchTab('users')">
              Пользователи
            </button>
            <button class="tab ${state.activeTab === 'settings' ? 'active' : ''}" onclick="switchTab('settings')">
              Настройки
            </button>
          </div>
          
          <div id="tabContent"></div>
        </div>
        
        <div class="chat-area" id="chatArea"></div>
      </div>
      
      ${state.showUsernameModal ? renderUsernameModal() : ''}
    </div>
  `;

  renderTabContent();
  renderChatArea();
}

function renderUsernameModal() {
  return `
    <div class="modal-overlay" onclick="closeUsernameModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>Установить юзернейм</h2>
        <p>Выберите уникальное имя (можно установить только один раз)</p>
        <input 
          type="text" 
          id="usernameInput" 
          placeholder="Введите юзернейм"
          maxlength="20"
        >
        <div class="modal-buttons">
          <button onclick="saveUsername()">Сохранить</button>
          <button class="back-btn" onclick="closeUsernameModal()">Отмена</button>
        </div>
      </div>
    </div>
  `;
}

function renderTabContent() {
  const content = document.getElementById('tabContent');
  
  if (state.activeTab === 'chats') {
    if (state.chats.length === 0) {
      content.innerHTML = '<div class="chat-list"><div style="padding: 40px; text-align: center; color: #cbd5e0;">Нет активных чатов<br>Начните общение во вкладке "Пользователи"</div></div>';
    } else {
      content.innerHTML = `
        <div class="chat-list">
          ${state.chats.map(chat => `
            <div class="chat-item ${state.selectedChat === chat.phoneNumber ? 'active' : ''}" onclick="selectChat('${chat.phoneNumber}')">
              <div class="avatar">${chat.username ? chat.username[0].toUpperCase() : chat.phoneNumber.slice(-3)}</div>
              <div class="chat-info">
                <div class="chat-name">${chat.username || chat.phoneNumber}</div>
                ${chat.lastMessage ? `<div class="chat-preview">${chat.lastMessage.text}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } 
  else if (state.activeTab === 'users') {
    content.innerHTML = `
      <div class="search-container">
        <input 
          type="text" 
          id="searchInput" 
          class="search-input"
          placeholder="🔍 Поиск по номеру или юзернейму..."
          value="${state.searchQuery}"
        >
      </div>
      <div class="chat-list" id="usersList">
        ${renderUsersList()}
      </div>
    `;
    
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      searchUsers(e.target.value);
    });
  }
  else {
    content.innerHTML = `
      <div class="settings">
        <h3 style="margin-bottom: 16px; color: #1a202c;">Аккаунт</h3>
        <div class="setting-group">
          <div class="setting-label">Номер телефона:</div>
          <div class="setting-value">${state.currentPhone}</div>
        </div>
        <div class="setting-group">
          <div class="setting-label">Юзернейм:</div>
          <div class="setting-value">
            ${state.username ? `@${state.username}` : 'Не установлен'}
            ${!state.username ? '<button class="small-btn" onclick="showUsernameModal()">Установить</button>' : ''}
          </div>
        </div>
        
        <h3 style="margin-bottom: 16px; margin-top: 24px; color: #1a202c;">О приложении</h3>
        <div class="setting-group">
          <div style="font-size: 14px; color: #718096;">
            <p>Версия: 2.0.0</p>
            <p style="margin-top: 8px;">Мессенджер с юзернеймами, поиском и сохранением сессий</p>
          </div>
        </div>
      </div>
    `;
  }
}

function renderUsersList() {
  const users = state.searchQuery ? state.allUsers : state.allUsers;
  
  if (users.length === 0) {
    return '<div style="padding: 40px; text-align: center; color: #cbd5e0;">Пользователи не найдены</div>';
  }
  
  return users.map(user => `
    <div class="chat-item" onclick="selectChat('${user.phoneNumber}')">
      <div class="avatar">${user.username ? user.username[0].toUpperCase() : user.phoneNumber.slice(-3)}</div>
      <div class="chat-info">
        <div class="chat-name">${user.username || user.phoneNumber}</div>
        <div class="chat-preview" style="color: #a0aec0;">${user.phoneNumber}</div>
      </div>
    </div>
  `).join('');
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

  const chatUser = state.allUsers.find(u => u.phoneNumber === state.selectedChat) || 
                   state.chats.find(c => c.phoneNumber === state.selectedChat);
  const displayName = chatUser?.username || state.selectedChat;
  const avatar = chatUser?.username ? chatUser.username[0].toUpperCase() : state.selectedChat.slice(-3);

  area.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${avatar}</div>
      <div>
        <div class="chat-title">${displayName}</div>
        <div class="chat-status">${chatUser?.username ? state.selectedChat : 'в сети'}</div>
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

// API функции
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
      state.error = 'Номер не зарегистрирован. Используйте +375000 или +375001';
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
    console.log('Verifying code for:', state.phoneNumber);
    
    const res = await fetch(`${API_URL}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: state.phoneNumber, code: state.code })
    });
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Error response:', errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        state.error = errorData.error || 'Ошибка сервера';
      } catch (e) {
        state.error = 'Ошибка сервера: ' + res.status;
      }
      render();
      return;
    }
    
    const data = await res.json();
    console.log('Verify response:', data);
    
    if (data.success) {
      state.sessionId = data.sessionId;
      state.currentPhone = data.phoneNumber;
      state.username = data.username;
      state.screen = 'messenger';
      
      // Сохраняем в cookies
      setCookie('sessionId', data.sessionId);
      setCookie('phoneNumber', data.phoneNumber);
      setCookie('username', data.username || '');
      
      console.log('Login successful, initializing messenger...');
      initMessenger();
    } else {
      state.error = data.error || 'Неверный код';
    }
  } catch (err) {
    state.error = 'Ошибка подключения к серверу';
    console.error('Verify error:', err);
  }
  render();
}

function initMessenger() {
  loadAllUsers();
  loadChats();
  
  // WebSocket
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

  // Polling fallback
  pollInterval = setInterval(() => {
    if (state.selectedChat) {
      loadMessages(state.selectedChat, true);
    }
    loadChats();
  }, 3000);
  
  render();
}

async function loadAllUsers() {
  try {
    const res = await fetch(`${API_URL}/api/users?sessionId=${state.sessionId}`);
    const data = await res.json();
    state.allUsers = data.users || [];
    if (state.screen === 'messenger' && state.activeTab === 'users') {
      renderTabContent();
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function searchUsers(query) {
  if (!query.trim()) {
    loadAllUsers();
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/users/search?sessionId=${state.sessionId}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    state.allUsers = data.users || [];
    
    const usersList = document.getElementById('usersList');
    if (usersList) {
      usersList.innerHTML = renderUsersList();
    }
  } catch (err) {
    console.error('Error searching users:', err);
  }
}

async function loadChats() {
  if (!state.sessionId) return;
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

async function loadMessages(phone, silent = false) {
  if (!state.sessionId) return;
  try {
    const res = await fetch(`${API_URL}/api/messages?sessionId=${state.sessionId}&withPhone=${phone}`);
    const data = await res.json();
    
    if (!silent) {
      state.messages = data.messages || [];
      state.selectedChat = phone;
      state.activeTab = 'chats';
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

// UI функции
function goBack() {
  state.screen = 'login';
  state.error = '';
  render();
}

function logout() {
  if (ws) ws.close();
  if (pollInterval) clearInterval(pollInterval);
  
  // Удаляем cookies
  deleteCookie('sessionId');
  deleteCookie('phoneNumber');
  deleteCookie('username');
  
  state = {
    screen: 'login',
    phoneNumber: '',
    code: '',
    sessionId: null,
    currentPhone: null,
    username: null,
    activeTab: 'chats',
    allUsers: [],
    chats: [],
    selectedChat: null,
    messages: [],
    messageText: '',
    searchQuery: '',
    error: '',
    showUsernameModal: false
  };
  
  render();
}

function switchTab(tab) {
  state.activeTab = tab;
  if (tab === 'users') {
    loadAllUsers();
  }
  renderTabContent();
}

function selectChat(phone) {
  loadMessages(phone);
}

function showUsernameModal() {
  state.showUsernameModal = true;
  renderMessenger();
  
  setTimeout(() => {
    const input = document.getElementById('usernameInput');
    if (input) input.focus();
  }, 100);
}

function closeUsernameModal() {
  state.showUsernameModal = false;
  renderMessenger();
}

async function saveUsername() {
  const input = document.getElementById('usernameInput');
  const username = input.value.trim();
  
  if (!username) {
    alert('Введите юзернейм');
    return;
  }
  
  if (username.length < 3) {
    alert('Юзернейм должен быть минимум 3 символа');
    return;
  }
  
  try {
    console.log('Setting username:', username);
    console.log('Session ID:', state.sessionId);
    
    const res = await fetch(`${API_URL}/api/auth/set-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId, username })
    });
    
    console.log('Set username response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Error response:', errorText);
      
      try {
        const errorData = JSON.parse(errorText);
        alert(errorData.error || 'Ошибка установки юзернейма');
      } catch (e) {
        alert('Ошибка сервера: ' + res.status);
      }
      return;
    }
    
    const data = await res.json();
    console.log('Username set response:', data);
    
    if (data.success) {
      state.username = username;
      setCookie('username', username);
      closeUsernameModal();
      alert('Юзернейм успешно установлен!');
    } else {
      alert(data.error || 'Ошибка установки юзернейма');
    }
  } catch (err) {
    alert('Ошибка подключения к серверу');
    console.error('Error:', err);
  }
}

// Инициализация
console.log('Запуск приложения...');
