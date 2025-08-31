const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { validateTelegramData } = require('./src/utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
}

// Хранилища
const lobbies = new Map();
const players = new Map();
const connections = new Map();

// Очистка пустых лобби каждые 5 минут
setInterval(cleanupEmptyLobbies, 5 * 60 * 1000);

app.use(cors({ 
    origin: ['https://telegram-web-app.com', 'http://localhost:3000', 'https://*.vercel.app'],
    credentials: true 
}));
app.use(express.json());

app.use((req, res, next) => {
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
        const { initData } = req.body;
        
        console.log('Auth request received, initData:', initData ? 'present' : 'missing');
        
        if (!initData) {
            console.error('initData is required');
            return res.status(400).json({ error: 'initData is required' });
        }

        const isValid = validateTelegramData(initData, TELEGRAM_BOT_TOKEN);
        
        if (!isValid) {
            console.error('Invalid Telegram data');
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }

        const urlParams = new URLSearchParams(initData);
        const userDataRaw = urlParams.get('user');
        
        if (!userDataRaw) {
            console.error('User data not found in initData');
            return res.status(400).json({ error: 'User data not found' });
        }
        
        let userData;
        try {
            userData = JSON.parse(userDataRaw);
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(400).json({ error: 'Invalid user data format' });
        }
        
        if (!userData.id) {
            console.error('User ID not found in user data');
            return res.status(400).json({ error: 'User ID is required' });
        }

        const player = {
            id: userData.id,
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            username: userData.username || '',
            language_code: userData.language_code || 'en'
        };
        
        players.set(userData.id.toString(), player);
        
        console.log('User authenticated successfully:', userData.id, userData.first_name);
        
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
    const publicLobbies = Array.from(lobbies.values())
        .filter(lobby => lobby.players.length < 2)
        .map(lobby => ({
            id: lobby.id,
            name: lobby.name,
            players: lobby.players.length,
            maxPlayers: 2,
            host: lobby.host
        }));
    
    res.json({ success: true, lobbies: publicLobbies });
});

app.post('/lobby/create', (req, res) => {
    try {
        const { userId, lobbyName = 'Quantum Lobby' } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const player = players.get(userId.toString());
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
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
            return res.status(404).json({ error: 'Player not found' });
        }

        if (lobby.players.some(p => p.id === player.id)) {
            return res.status(400).json({ error: 'Player already in lobby' });
        }

        lobby.players.push(player);
        
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

        lobby.players.splice(playerIndex, 1);
        
        broadcastToLobby(lobbyId, {
            type: 'player_left',
            userId: userId,
            lobby: lobby
        });

        res.json({ success: true, lobby: lobby });
        
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
            moves: []
        };

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
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    const connectionId = Math.random().toString(36).substr(2, 9);
    connections.set(connectionId, { ws, lobbyId: null, userId: null });
    
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'ping' }));
            } catch (error) {
                console.error('Ping error:', error);
                clearInterval(pingInterval);
            }
        }
    }, 25000);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleWebSocketMessage(connectionId, message);
        } catch (error) {
            console.error('WebSocket message error:', error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid message format' 
            }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed:', connectionId);
        clearInterval(pingInterval);
        connections.delete(connectionId);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(pingInterval);
        connections.delete(connectionId);
    });
});

function handleWebSocketMessage(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
        case 'join_lobby':
            handleJoinLobby(connectionId, message);
            break;
        case 'game_move':
            handleGameMove(connectionId, message);
            break;
        case 'ping':
            if (connection.ws.readyState === connection.ws.OPEN) {
                connection.ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleJoinLobby(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection) return;

    const { lobbyId, userId, initData } = message;
    
    if (!validateTelegramData(initData, TELEGRAM_BOT_TOKEN)) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid authentication' 
        }));
        return;
    }

    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Lobby not found' 
        }));
        return;
    }

    const playerInLobby = lobby.players.some(p => p.id.toString() === userId.toString());
    if (!playerInLobby) {
        connection.ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Player not in lobby' 
        }));
        return;
    }

    connection.lobbyId = lobbyId;
    connection.userId = userId;

    console.log(`User ${userId} joined lobby ${lobbyId} via WebSocket`);
    
    connection.ws.send(JSON.stringify({ 
        type: 'lobby_joined', 
        lobby: lobby 
    }));
}

function handleGameMove(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.lobbyId) return;

    const lobby = lobbies.get(connection.lobbyId);
    if (!lobby || lobby.status !== 'playing') return;

    const { move } = message;
    const { x, y, z, symbol } = move;

    if (connection.userId !== lobby.gameState.currentPlayer) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Not your turn'
        }));
        return;
    }

    const player = lobby.gameState.players.find(p => p.id === connection.userId);
    if (!player || player.symbol !== symbol) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid symbol'
        }));
        return;
    }

    const index = (x + 1) * 9 + (y + 1) * 3 + (z + 1);
    if (lobby.gameState.board[index] !== null) {
        connection.ws.send(JSON.stringify({
            type: 'error',
            message: 'Cell already occupied'
        }));
        return;
    }

    lobby.gameState.board[index] = symbol;
    lobby.gameState.moves.push({ x, y, z, symbol, player: connection.userId });

    const winner = checkWin(lobby.gameState.board, symbol);
    if (winner) {
        lobby.status = 'finished';
        lobby.gameState.winner = winner;
        
        broadcastToLobby(connection.lobbyId, {
            type: 'game_ended',
            lobby: lobby,
            winner: winner
        });
        
        return;
    }

    if (lobby.gameState.board.every(cell => cell !== null)) {
        lobby.status = 'finished';
        lobby.gameState.winner = 'draw';
        
        broadcastToLobby(connection.lobbyId, {
            type: 'game_ended',
            lobby: lobby,
            winner: 'draw'
        });
        
        return;
    }

    const currentPlayerIndex = lobby.gameState.players.findIndex(p => p.id === lobby.gameState.currentPlayer);
    const nextPlayerIndex = (currentPlayerIndex + 1) % lobby.gameState.players.length;
    lobby.gameState.currentPlayer = lobby.gameState.players[nextPlayerIndex].id;

    broadcastToLobby(connection.lobbyId, {
        type: 'game_update',
        gameState: lobby.gameState,
        move: move
    });
}

function checkWin(board, symbol) {
    for (let z = 0; z < 3; z++) {
        for (let y = 0; y < 3; y++) {
            if (board[z*9 + y*3] === symbol && 
                board[z*9 + y*3 + 1] === symbol && 
                board[z*9 + y*3 + 2] === symbol) {
                return symbol;
            }
        }
        
        for (let x = 0; x < 3; x++) {
            if (board[z*9 + x] === symbol && 
                board[z*9 + x + 3] === symbol && 
                board[z*9 + x + 6] === symbol) {
                return symbol;
            }
        }
        
        if (board[z*9] === symbol && board[z*9 + 4] === symbol && board[z*9 + 8] === symbol) {
            return symbol;
        }
        if (board[z*9 + 2] === symbol && board[z*9 + 4] === symbol && board[z*9 + 6] === symbol) {
            return symbol;
        }
    }
    
    for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
            if (board[x + y*3] === symbol && 
                board[x + y*3 + 9] === symbol && 
                board[x + y*3 + 18] === symbol) {
                return symbol;
            }
        }
    }
    
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

function broadcastToLobby(lobbyId, message) {
    connections.forEach((conn, connId) => {
        if (conn.lobbyId === lobbyId && conn.ws.readyState === conn.ws.OPEN) {
            try {
                conn.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('Broadcast error:', error);
            }
        }
    });
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
        playersCount: players.size
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;