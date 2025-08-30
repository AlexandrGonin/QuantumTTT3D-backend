const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/auth', require('./src/controllers/authController'));
app.use('/lobby', require('./src/middleware/auth'), require('./src/controllers/lobbyController'));

const allowedOrigins = [
  'https://quantumttt3d-frontend.vercel.app/', // Замените на ваш Vercel URL
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'http://localhost:5173', 
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || 
        origin.includes('.vercel.app') || 
        origin.includes('.onrender.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, request) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        console.log('Received:', message.toString());
        // Здесь будет обработка игровых сообщений
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