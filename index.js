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

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Test endpoint' });
});

// ВСЕ возможные эндпоинты аутентификации
app.post('/auth', (req, res) => {
  handleAuth(req, res);
});

app.post('/api/auth', (req, res) => {
  handleAuth(req, res);
});

app.post('/api/v1/auth', (req, res) => {
  handleAuth(req, res);
});

app.post('/auth/telegram', (req, res) => {
  handleAuth(req, res);
});

app.post('/api/auth/telegram', (req, res) => {
  handleAuth(req, res);
});

// ВСЕ возможные эндпоинты лобби
app.get('/lobby/list', (req, res) => {
  handleLobbyList(req, res);
});

app.get('/api/lobby/list', (req, res) => {
  handleLobbyList(req, res);
});

app.get('/api/lobbies', (req, res) => {
  handleLobbyList(req, res);
});

app.post('/lobby/create', (req, res) => {
  handleLobbyCreate(req, res);
});

app.post('/api/lobby/create', (req, res) => {
  handleLobbyCreate(req, res);
});

app.post('/lobby/join', (req, res) => {
  handleLobbyJoin(req, res);
});

app.post('/api/lobby/join', (req, res) => {
  handleLobbyJoin(req, res);
});

// Функции обработчики
function handleAuth(req, res) {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }
    
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
    res.status(500).json({ error: 'Internal server error' });
  }
}

function handleLobbyList(req, res) {
  res.json({
    success: true,
    lobbies: [
      {
        id: 'lobby-1',
        name: 'Test Lobby',
        players: 1,
        maxPlayers: 2
      }
    ]
  });
}

function handleLobbyCreate(req, res) {
  res.json({ 
    success: true, 
    lobbyId: 'lobby-' + Date.now(),
    message: 'Lobby created'
  });
}

function handleLobbyJoin(req, res) {
  res.json({ 
    success: true, 
    lobbyId: 'joined-lobby',
    message: 'Joined lobby'
  });
}

// Лог всех запросов для отладки
app.use((req, res, next) => {
  console.log('Request:', req.method, req.url);
  next();
});

app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});