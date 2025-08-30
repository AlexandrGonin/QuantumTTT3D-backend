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

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    message: 'Quantum 3D Tic-Tac-Toe Backend is running!',
    status: 'OK'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Backend is connected!'
  });
});

app.post('/api/auth', (req, res) => {
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
        id: Math.floor(Math.random() * 1000000000),
        first_name: 'Telegram',
        last_name: 'User',
        username: 'tg_user',
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

app.post('/auth', (req, res) => {
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
        id: Math.floor(Math.random() * 1000000000),
        first_name: 'Telegram',
        last_name: 'User',
        username: 'tg_user_old',
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

app.get('/api/lobbies', (req, res) => {
  res.json({
    success: true,
    lobbies: [
      {
        id: 'lobby-1',
        name: 'Test Lobby',
        players: 1,
        maxPlayers: 2,
        status: 'waiting'
      }
    ]
  });
});

app.get('/lobby/list', (req, res) => {
  res.json({
    success: true,
    lobbies: [
      {
        id: 'lobby-2',
        name: 'Old Lobby',
        players: 1,
        maxPlayers: 2,
        status: 'waiting'
      }
    ]
  });
});

app.post('/lobby/create', (req, res) => {
  res.json({ 
    success: true, 
    lobbyId: 'temp-lobby-' + Date.now(),
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

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const server = app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;