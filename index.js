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

app.use(cors({ origin: true }));
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
        
        if (!initData) {
            return res.status(400).json({ error: 'initData is required' });
        }

        const isValid = validateTelegramData(initData, TELEGRAM_BOT_TOKEN);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }

        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user'));
        
        const player = {
            id: userData.id,
            first_name: userData.first_name,
            last_name: userData.last_name || '',
            username: userData.username || '',
            language_code: userData.language_code || 'en'
        };
        
        players.set(userData.id.toString(), player);
        
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

        lobby.players.splice(playerIndex, 1);
        
        // Уведомляем о выходе игрока
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

        // Проверяем что пользователь - хост лобби
        if (lobby.host.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Only host can start the game' });
        }

        if (lobby.players.length < 2) {
            return res.status(400).json({ error: 'Need 2 players to start' });
        }

        lobby.status = 'playing';
        lobby.gameState = {
            board: Array(27).fill(null),
            currentPlayer: 0,
            players: lobby.players.map((p, index) => ({
                id: p.id,
                symbol: index === 0 ? 'X' : 'O'
            }))
        };

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
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substr(2, 9);
    connections.set(connectionId, { ws, lobbyId: null });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleWebSocketMessage(connectionId, message);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        connections.delete(connectionId);
    });
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function generateLobbyId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function broadcastToLobby(lobbyId, message) {
    connections.forEach((conn, connId) => {
        if (conn.lobbyId === lobbyId) {
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
        // Удаляем лобби которые пустые или старше 1 часа
        if (lobby.players.length === 0 || (now - lobby.createdAt > 60 * 60 * 1000)) {
            lobbies.delete(lobbyId);
            removedCount++;
        }
    });
    
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} empty lobbies`);
    }
}

function handleWebSocketMessage(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
        case 'join_lobby':
            connection.lobbyId = message.lobbyId;
            break;
        case 'game_move':
            handleGameMove(connectionId, message);
            break;
    }
}

function handleGameMove(connectionId, message) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.lobbyId) return;

    const lobby = lobbies.get(connection.lobbyId);
    if (!lobby || lobby.status !== 'playing') return;

    // Здесь будет обработка ходов игры
    broadcastToLobby(connection.lobbyId, {
        type: 'game_update',
        move: message.move,
        gameState: lobby.gameState
    });
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

module.exports = app;