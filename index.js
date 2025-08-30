const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

console.log('Server starting on port:', PORT);

app.use(cors({ origin: true }));
app.use(express.json());

// Исправляем неправильные URL с двойным слешем
app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
    console.log('Fixed URL:', req.url);
  }
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ОСНОВНОЙ эндпоинт аутентификации
app.post('/auth', (req, res) => {
  console.log('Auth request received');
  
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ 
        success: false,
        error: 'initData is required' 
      });
    }
    
    res.json({
      success: true,
      user: {
        id: 123456789,
        first_name: 'Telegram',
        last_name: 'User',
        username: 'tguser',
        language_code: 'ru'
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Дублирующие эндпоинты на всякий случай
app.post('/api/auth', (req, res) => {
  console.log('API auth request');
  handleAuth(req, res);
});

app.post('/auth/telegram', (req, res) => {
  console.log('Telegram auth request');
  handleAuth(req, res);
});

// Функция обработки аутентификации
function handleAuth(req, res) {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }
    
    res.json({
      success: true,
      user: {
        id: Math.floor(Math.random() * 1000000000),
        first_name: 'User',
        last_name: 'Test',
        username: 'testuser'
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Лобби эндпоинты
app.get('/lobby/list', (req, res) => {
  res.json({
    success: true,
    lobbies: []
  });
});

app.post('/lobby/create', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'lobby-' + Date.now()
  });
});

app.post('/lobby/join', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'joined-lobby'
  });
});

// Лог всех запросов
app.use((req, res, next) => {
  console.log('Request:', req.method, req.url, 'Body:', req.body);
  next();
});

app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ 
    success: false,
    error: 'Endpoint not found: ' + req.url 
  });
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});