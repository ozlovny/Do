console.log('Скрипт загрузился!');

// Конфигурация - ЗАМЕНИ НА СВОЙ RAILWAY URL
const API_URL = 'http://localhost:3000';

// Состояние приложения
let state = {
  screen: 'login',
  phoneNumber: '',
  code: '',
  sessionId: null,
  currentPhone: null,
  activeTab: 'chats',
  chats: [],
  selectedChat: null,
  messages: [],
  messageText: '',
  error: ''
};

let ws = null;
let pollInterval = null;

// Рендер функции
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
        ${state.error ? `<div class="error">${state.error}</div>` : ''}
        <input 
          type="text" 
          id="codeInput" 
          placeholder="Введите код"
          maxlength="5"
          style="text-align: center; font-size: 24px; letter-spacing: 8px;"
          value="${state.code}"
        >
        <button onclick="verifyCode()">Подтвердить</button>
        <button class="back-btn" onclick="goBack()">Назад</button>
        <div class="hint">Код: 11111</div>
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
          <span>${state.currentPhone}</span>
          <button class="logout-btn" onclick="logout()">🚪</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="sidebar">
          <div class="tabs">
            <button class="tab ${state.activeTab === 'chats' ? 'active' : ''}" onclick="switchTab('chats')">
              Чаты
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
      content.innerHTML = '<div class="chat-list"><div style="padding: 40px; text-align: center; color: #cbd5e0;">Нет чатов</div></div>';
    } else {
      content.innerHTML = `
        <div class="chat-list">
          ${state.chats.map(chat => `
            <div class="chat-item ${state.selectedChat === chat.phoneNumber ? 'active' : ''}" onclick="selectChat('${chat.phoneNumber}')">
              <div class="avatar">${chat.phoneNumber.slice(-3)}</div>
              <div class="chat-info">
                <div class="chat-name">${chat.phoneNumber}</div>
                ${chat.lastMessage ? `<div class="chat-preview">${chat.lastMessage.text}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else {
    content.innerHTML = `
      <div class="settings">
        <h3 style="margin-bottom: 16px; color: #1a202c;">Аккаунт</h3>
        <div class="setting-group">
          <div class="setting-label">Номер телефона:</div>
          <div class="setting-value">${state.currentPhone}</div>
        </div>
        
        <h3 style="margin-bottom: 16px; margin-top: 24px; color: #1a202c;">О приложении</h3>
        <div class="setting-group">
          <div style="font-size: 14px; color: #718096;">
            <p>Версия: 1.0.0</p>
            <p style="margin-top: 8px;">Простой мессенджер для обмена сообщениями</p>
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

  area.innerHTML = `
    <div class="chat-header">
      <div class="avatar">${state.selectedChat.slice(-3)}</div>
      <div>
        <div class="chat-title">${state.selectedChat}</div>
        <div class="chat-status">в сети</div>
      </div>
    </div>
    
    <div class="messages" id="messagesList">
      ${state.messages.map(msg => {
        const isOwn = msg.from === state.currentPhone;
        return `
          <div class="message ${isOwn ? 'own' : ''}">
            <div class="message-bubble">
              <div class="message-text">${msg.text}</div>
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
    const res = await fetch(`${API_URL}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: state.phoneNumber, code: state.code })
    });
    
    const data = await res.json();
    
    if (data.success) {
      state.sessionId = data.sessionId;
      state.currentPhone = data.phoneNumber;
      state.screen = 'messenger';
      initMessenger();
    } else {
      state.error = data.error || 'Неверный код';
    }
  } catch (err) {
    state.error = 'Ошибка подключения к серверу';
    console.error('Error:', err);
  }
  render();
}

function initMessenger() {
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
  }, 2000);
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

async function loadMessages(phone, silent = false) {
  try {
    const res = await fetch(`${API_URL}/api/messages?sessionId=${state.sessionId}&withPhone=${phone}`);
    const data = await res.json();
    
    if (!silent) {
      state.messages = data.messages || [];
      state.selectedChat = phone;
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
  
  state = {
    screen: 'login',
    phoneNumber: '',
    code: '',
    sessionId: null,
    currentPhone: null,
    activeTab: 'chats',
    chats: [],
    selectedChat: null,
    messages: [],
    messageText: '',
    error: ''
  };
  
  render();
}

function switchTab(tab) {
  state.activeTab = tab;
  renderTabContent();
}

function selectChat(phone) {
  loadMessages(phone);
}

// Инициализация
console.log('Запуск приложения...');
render();
