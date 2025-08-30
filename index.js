const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем обязательные переменные окружения
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

console.log('🚀 Server starting...');
console.log('📍 Port:', PORT);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// ==================== CORS НАСТРОЙКА ====================
app.use(cors({
  origin: true, // Разрешаем все домены для тестирования
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Обработка preflight OPTIONS запросов
app.options('*', cors());

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static('public'));

// ==================== БАЗОВЫЕ РОУТЫ ====================
app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 Quantum 3D Tic-Tac-Toe Backend is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ==================== АУТЕНТИФИКАЦИЯ ====================
app.post('/auth', (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }
    
    console.log('🔐 Auth attempt received');
    
    // Заглушка для тестирования
    res.json({
      success: true,
      user: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User', 
        username: 'testuser',
        language_code: 'en'
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ЛОББИ (УПРОЩЕННЫЕ РОУТЫ) ====================
app.get('/lobby/list', (req, res) => {
  res.json({ lobbies: [] });
});

app.post('/lobby/create', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'temp-lobby-' + Date.now(),
    message: 'Lobby created successfully'
  });
});

// ИСПРАВЛЕННЫЙ РОУТ - без параметров в URL
app.post('/lobby/join', (req, res) => {
  const { lobbyId } = req.body;
  res.json({ 
    success: true, 
    lobbyId: lobbyId || 'default-lobby',
    message: 'Joined lobby successfully'
  });
});

// ==================== WEB SOCKET СЕРВЕР ====================
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, request) => {
  console.log('🔌 New WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📨 Received:', data);
      
      ws.send(JSON.stringify({
        type: 'ack',
        message: 'Received',
        data: data
      }));
      
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
    }
  });
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;