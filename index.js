// index.js - Упрощенная версия без роутеров
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем обязательные переменные
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

console.log('🚀 Server starting...');
console.log('📍 Port:', PORT);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// ==================== CORS ====================
app.use(cors({
  origin: true,
  credentials: true
}));

// ==================== MIDDLEWARE ====================
app.use(express.json());

// ==================== ПРОСТЫЕ РОУТЫ ====================
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

app.post('/auth', (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }
    
    console.log('🔐 Auth attempt received');
    
    res.json({
      success: true,
      user: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User', 
        username: 'testuser'
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ЗАГЛУШКИ ЛОББИ ====================
app.get('/lobby/list', (req, res) => {
  res.json({ lobbies: [] });
});

app.post('/lobby/create', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'temp-lobby',
    message: 'Lobby created successfully'
  });
});

app.post('/lobby/join', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'joined-lobby',
    message: 'Joined lobby successfully'
  });
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ==================== SERVER START ====================
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;