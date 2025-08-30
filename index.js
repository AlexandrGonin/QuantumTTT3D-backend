const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем обязательные переменные
if (!TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

console.log('🚀 Server starting...');
console.log('📍 Port:', PORT);
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedPatterns = [
      'quantumttt3d-frontend.vercel.app',
    ];

    const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/auth', require('./src/controllers/authController'));
app.use('/lobby', require('./src/middleware/auth'), require('./src/controllers/lobbyController'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Quantum 3D Tic-Tac-Toe Backend is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// HTTP server
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, request) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});