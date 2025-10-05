const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { validateTelegramData } = require('./src/utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
    console.error('Please set TELEGRAM_BOT_TOKEN environment variable');
    process.exit(1);
}

console.log('Server starting with bot token:', TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');

// Хранилища
const lobbies = new Map();
const players = new Map();
const connections = new Map();

// Очистка пустых лобби каждые 5 минут
setInterval(cleanupEmptyLobbies, 5 * 60 * 1000);

app.use(cors({ 
    origin: ['https://telegram-web-app.com', 'http://localhost:3000', 'https://*.vercel.app', 'https://*.telegram.org'],
    credentials: true 
}));
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    if (req.url.includes('//')) {
        req.url = req.url.replace(/\/+/g, '/');
    }
    next();
});

// ==================== АУТЕНТИФИКАЦИЯ ====================
app.post('/auth', (req, res) => {
    handleAuth(req, res);
});

function handleAuth(req, res) {
    try {
        console.log('Auth request received');
        const { initData } = req.body;
        
        if (!initData) {
            console.log('No initData provided');
            return res.status(400).json({ error: 'initData is required' });
        }

        console.log('Validating Telegram data...');
        const isValid = validateTelegramData(initData, TELEGRAM_BOT_TOKEN);
        
        if (!isValid) {
            console.log('Invalid Telegram data');
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }

        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user'));
        
        const player = {
            id: userData.id,
            first_name: userData.first_name,
            last_name: userData.last_name || '',
            username: userData.username || '',
            language_code: userData.language_code || 'en',
            photo_url: userData.photo_url || ''
        };
        
        players.set(userData.id.toString(), player);
        
        console.log('User authenticated successfully:', player.id, player.first_name);
        
        res.json({
            success: true,
            user: player
        });
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ==================== СИСТЕМА ЛОББИ ====================
app.get('/lobby/list', (req, res) => {
    try {
        const publicLobbies = Array.from(lobbies.values())
            .filter(lobby => lobby.players.length < 2 && lobby.status === 'waiting')
            .map(lobby => ({
                id: lobby.id,
                name: lobby.name,
                players: lobby.players.length,
                maxPlayers: 2,
                host: lobby.host
            }));
        
        res.json({ success: true, lobbies: publicLobbies });
    } catch (error) {
        console.error('Lobby list error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/lobby/create', (req, res) => {
    try {
        const { userId, lobbyName = 'Quantum Lobby' } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const player = players.get(userId.toString());
        if (!player) {
            return res.status(404).json({ error: 'Player not found. Please authenticate first.' });
        }

        const lobbyId = generateLobbyId();
        const lobby = {
            id: lobbyId,
            name: lobbyName,
            players: [player],
            host: player.id,
            status: 'waiting',
            createdAt: Date.now(),
            gameState: null
        };

        lobbies.set(lobbyId, lobby);
        
        console.log(`Lobby created: ${lobbyId} by user: ${userId}`);
        
        res.json({ success: true, lobby: lobby });
        
    } catch (error) {
        console.error('Create lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/lobby/join', (req, res) => {
    try {
        const { userId, lobbyId } = req.body;
        
        if (!userId || !lobbyId) {
            return res.status(400).json({ error: 'userId and lobbyId are required' });
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        if (lobby.players.length >= 2) {
            return res.status(400).json({ error: 'Lobby is full' });
        }

        const player = players.get(userId.toString());
        if (!player) {
            return res.status(404).json({ error: 'Player not found. Please authenticate first.' });
        }

        if (lobby.players.some(p => p.id === player.id)) {
            return res.status(400).json({ error: 'Player already in lobby' });
        }

        lobby.players.push(player);
        
        console.log(`User ${userId} joined lobby ${lobbyId}`);
        
        // Уведомляем всех игроков о новом участнике
        broadcastToLobby(lobbyId, {
            type: 'player_joined',
            player: player,
            lobby: lobby
        });

        res.json({ success: true, lobby: lobby });
        
    } catch (error) {
        console.error('Join lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/lobby/:id/leave', (req, res) => {
    try {
        const { userId } = req.body;
        const lobbyId = req.params.id;
        
        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        const playerIndex = lobby.players.findIndex(p => p.id.toString() === userId.toString());
        if (playerIndex === -1) {
            return res.status(404).json({ error: 'Player not in lobby' });
        }

        const leftPlayer = lobby.players[playerIndex];
        lobby.players.splice(playerIndex, 1);
        
        console.log(`User ${userId} left lobby ${lobbyId}`);
        
        // Уведомляем о выходе игрока
        broadcastToLobby(lobbyId, {
            type: 'player_left',
            userId: userId,
            player: leftPlayer,
            lobby: lobby
        });

        // Если лобби пустое, удаляем его
        if (lobby.players.length === 0) {
            lobbies.delete(lobbyId);
            console.log(`Lobby ${lobbyId} deleted (empty)`);
        }

        res.json({ success: true });
        
    } catch (error) {
        console.error('Leave lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/lobby/:id/start', (req, res) => {
    try {
        const { userId } = req.body;
        const lobbyId = req.params.id;
        
        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        if (lobby.host.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Only host can start the game' });
        }

        if (lobby.players.length < 2) {
            return res.status(400).json({ error: 'Need 2 players to start' });
        }

        lobby.status = 'playing';
        lobby.gameState = {
            board: Array(27).fill(null),
            currentPlayer: lobby.players[0].id,
            players: lobby.players.map((p, index) => ({
                id: p.id,
                symbol: index === 0 ? 'X' : 'O',
                name: p.first_name
            })),
            moves: [],
            winner: null
        };

        console.log(`Game started in lobby ${lobbyId}`);
        
        // Уведомляем о начале игры
        broadcastToLobby(lobbyId, {
            type: 'game_started',
            lobby: lobby
        });

        res.json({ success: true, lobby: lobby });
        
    } catch (error) {
        console.error('Start game error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/lobby/:id', (req, res) => {
    try {
        const lobby = lobbies.get(req.params.id);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        res.json({ success: true, lobby: lobby });
        
    } catch (error) {
        console.error('Get lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== WEB SOCKET ====================
const server = app.listen(PORT, () => {
    console.log('Server running on port', PORT);
    console.log('WebSocket available on port', PORT);
});

const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

// Храним активные ping интервалы
const pingIntervals = new Map();

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);
    
    const connectionId = Math.random().toString(36).substr(2, 9);
    connections.set(connectionId, { 
        ws, 
        lobbyId: null, 
        userId: null,
        isAlive: true,
        ip: req.socket.remoteAddress
    });

    // Устанавливаем обработчик pong для проверки активности
    ws.on('pong', () => {
        const conn = connections.get(connectionId);
        if (conn) {
            conn.isAlive = true;
        }
    });

    // Отправляем приветственное сообщение
    ws.send(JSON.stringify({ 
        type: 'connected',
        message: 'WebSocket connection established',
        connectionId: connectionId,
        timestamp: Date.now()
    }));

    // Настраиваем интервал проверки активности
    const interval = setInterval(() => {
        const conn = connections.get(connectionId);
        if (!conn) {
            clearInterval(interval);
            return;
        }

        if (conn.isAlive === false) {
            console.log('Connection terminated due to inactivity:', connectionId);
            conn.ws.terminate();
            connections.delete(connectionId);
            clearInterval(interval);
            pingIntervals.delete(connectionId);
            return;
        }

        conn.isAlive = false;
        try {
            conn.ws.ping();
        } catch (error) {
            console.error('Ping error:', error);
            connections.delete(connectionId);
            clearInterval(interval);
            pingIntervals.delete(connectionId);
        }
    }, 30000);

    pingIntervals.set(connectionId, interval);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('WebSocket message received:', message.type);
            handleWebSocketMessage(connectionId, message);
        } catch (error) {
            console.error('WebSocket message parsing error:', error);
            try {
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Invalid message format',
                    timestamp: Date.now()
                }));
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    });

    ws.on('close', (code, reason) => {
        console.log('WebSocket connection closed:', connectionId, 'Code:', code, 'Reason:', reason.toString());
        const interval = pingIntervals.get(connectionId);
        if (interval) {
            clearInterval(interval);
            pingIntervals.delete(connectionId);
        }
        
        // Удаляем соединение из хранилища
        const connection = connections.get(connectionId);
        if (connection) {
            connections.delete(connectionId);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', connectionId, error);
        const interval = pingIntervals.get(connectionId);
        if (interval) {
            clearInterval(interval);
            pingIntervals.delete(connectionId);
        }
        connections.delete(connectionId);
    });
});

function handleWebSocketMessage(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.ws || connection.ws.readyState !== connection.ws.OPEN) {
        return;
    }

    try {
        switch (message.type) {
            case 'join_lobby':
                handleJoinLobby(connectionId, message);
                break;
            case 'game_move':
                handleGameMove(connectionId, message);
                break;
            case 'ping':
                connection.ws.send(JSON.stringify({ 
                    type: 'pong', 
                    timestamp: Date.now() 
                }));
                break;
            case 'heartbeat':
                connection.ws.send(JSON.stringify({ 
                    type: 'heartbeat_ack', 
                    timestamp: Date.now() 
                }));
                break;
            default:
                console.log('Unknown message type:', message.type);
                connection.ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Unknown message type',
                    timestamp: Date.now()
                }));
        }
    } catch (error) {
        console.error('Error handling WebSocket message:', error);
        try {
            connection.ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Internal server error',
                timestamp: Date.now()
            }));
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
        }
    }
}

function handleJoinLobby(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection) return;

    const { lobbyId, userId, initData } = message;
    
    // Проверяем авторизацию
    if (!validateTelegramData(initData, TELEGRAM_BOT_TOKEN)) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid authentication',
            timestamp: Date.now()
        }));
        return;
    }

    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Lobby not found',
            timestamp: Date.now()
        }));
        return;
    }

    // Проверяем что пользователь в лобби
    const playerInLobby = lobby.players.some(p => p.id.toString() === userId.toString());
    if (!playerInLobby) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Player not in lobby',
            timestamp: Date.now()
        }));
        return;
    }

    connection.lobbyId = lobbyId;
    connection.userId = userId;

    console.log(`User ${userId} joined lobby ${lobbyId} via WebSocket`);
    
    connection.ws.send(JSON.stringify({ 
        type: 'lobby_joined', 
        lobby: lobby,
        success: true,
        timestamp: Date.now()
    }));

    // Уведомляем других игроков в лобби
    broadcastToLobby(lobbyId, {
        type: 'player_connected',
        userId: userId,
        player: lobby.players.find(p => p.id.toString() === userId.toString()),
        timestamp: Date.now()
    }, connectionId);
}

function handleGameMove(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.lobbyId) return;

    const lobby = lobbies.get(connection.lobbyId);
    if (!lobby || lobby.status !== 'playing') return;

    const { move } = message;
    const { x, y, z, symbol } = move;

    // Проверяем что ход делает текущий игрок
    if (connection.userId !== lobby.gameState.currentPlayer) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Not your turn',
            timestamp: Date.now()
        }));
        return;
    }

    // Проверяем что символ совпадает
    const player = lobby.gameState.players.find(p => p.id === connection.userId);
    if (!player || player.symbol !== symbol) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid symbol',
            timestamp: Date.now()
        }));
        return;
    }

    // Проверяем что клетка свободна
    const index = (x + 1) * 9 + (y + 1) * 3 + (z + 1);
    if (index < 0 || index >= 27 || lobby.gameState.board[index] !== null) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid move or cell already occupied',
            timestamp: Date.now()
        }));
        return;
    }

    // Делаем ход
    lobby.gameState.board[index] = symbol;
    lobby.gameState.moves.push({ x, y, z, symbol, player: connection.userId, index });

    // Проверяем победу
    const winner = checkWin(lobby.gameState.board, symbol);
    if (winner) {
        lobby.status = 'finished';
        lobby.gameState.winner = winner;
        
        broadcastToLobby(connection.lobbyId, {
            type: 'game_ended',
            lobby: lobby,
            winner: winner,
            timestamp: Date.now()
        });
        
        return;
    }

    // Проверяем ничью
    if (lobby.gameState.board.every(cell => cell !== null)) {
        lobby.status = 'finished';
        lobby.gameState.winner = 'draw';
        
        broadcastToLobby(connection.lobbyId, {
            type: 'game_ended',
            lobby: lobby,
            winner: 'draw',
            timestamp: Date.now()
        });
        
        return;
    }

    // Передаем ход следующему игроку
    const currentPlayerIndex = lobby.gameState.players.findIndex(p => p.id === lobby.gameState.currentPlayer);
    const nextPlayerIndex = (currentPlayerIndex + 1) % lobby.gameState.players.length;
    lobby.gameState.currentPlayer = lobby.gameState.players[nextPlayerIndex].id;

    // Отправляем обновление игры
    broadcastToLobby(connection.lobbyId, {
        type: 'game_update',
        gameState: lobby.gameState,
        move: move,
        timestamp: Date.now()
    });
}

function checkWin(board, symbol) {
    // Проверка линий в каждом слое (z)
    for (let z = 0; z < 3; z++) {
        // Горизонтальные линии
        for (let y = 0; y < 3; y++) {
            if (board[z*9 + y*3] === symbol && 
                board[z*9 + y*3 + 1] === symbol && 
                board[z*9 + y*3 + 2] === symbol) {
                return symbol;
            }
        }
        
        // Вертикальные линии
        for (let x = 0; x < 3; x++) {
            if (board[z*9 + x] === symbol && 
                board[z*9 + x + 3] === symbol && 
                board[z*9 + x + 6] === symbol) {
                return symbol;
            }
        }
        
        // Диагонали в слое
        if (board[z*9] === symbol && board[z*9 + 4] === symbol && board[z*9 + 8] === symbol) {
            return symbol;
        }
        if (board[z*9 + 2] === symbol && board[z*9 + 4] === symbol && board[z*9 + 6] === symbol) {
            return symbol;
        }
    }
    
    // Проверка вертикальных линий между слоями
    for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
            if (board[x + y*3] === symbol && 
                board[x + y*3 + 9] === symbol && 
                board[x + y*3 + 18] === symbol) {
                return symbol;
            }
        }
    }
    
    // Проверка пространственных диагоналей
    if (board[0] === symbol && board[13] === symbol && board[26] === symbol) {
        return symbol;
    }
    if (board[2] === symbol && board[13] === symbol && board[24] === symbol) {
        return symbol;
    }
    if (board[6] === symbol && board[13] === symbol && board[20] === symbol) {
        return symbol;
    }
    if (board[8] === symbol && board[13] === symbol && board[18] === symbol) {
        return symbol;
    }
    
    return null;
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function generateLobbyId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function broadcastToLobby(lobbyId, message, excludeConnectionId = null) {
    let sentCount = 0;
    connections.forEach((conn, connId) => {
        if (conn.lobbyId === lobbyId && conn.ws && conn.ws.readyState === conn.ws.OPEN && connId !== excludeConnectionId) {
            try {
                conn.ws.send(JSON.stringify(message));
                sentCount++;
            } catch (error) {
                console.error('Broadcast error:', error);
                connections.delete(connId);
            }
        }
    });
    
    console.log(`Broadcast to lobby ${lobbyId}: ${message.type} (sent to ${sentCount} connections)`);
}

function cleanupEmptyLobbies() {
    const now = Date.now();
    let removedCount = 0;
    
    lobbies.forEach((lobby, lobbyId) => {
        if (lobby.players.length === 0 || (now - lobby.createdAt > 60 * 60 * 1000)) {
            lobbies.delete(lobbyId);
            removedCount++;
        }
    });
    
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} empty lobbies`);
    }
}

// ==================== БАЗОВЫЕ ЭНДПОИНТЫ ====================
app.get('/', (req, res) => {
    res.json({ 
        message: 'Quantum 3D Tic-Tac-Toe Backend is running!',
        lobbiesCount: lobbies.size,
        playersCount: players.size,
        connectionsCount: connections.size,
        websocket: 'active'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        stats: {
            lobbies: lobbies.size,
            players: players.size,
            connections: connections.size
        }
    });
});

// Обработка несуществующих маршрутов
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Очистка при завершении
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    wss.close(() => {
        console.log('WebSocket server closed');
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    });
});

console.log('Server initialization complete');
module.exports = app;