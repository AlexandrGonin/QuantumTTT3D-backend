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

// Хранилище лобби и игроков
const lobbies = new Map();
const players = new Map();

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

app.post('/api/auth', (req, res) => {
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
        
        // Сохраняем игрока
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
        .filter(lobby => lobby.isPublic && lobby.players.length < 2)
        .map(lobby => ({
            id: lobby.id,
            name: lobby.name,
            players: lobby.players.length,
            maxPlayers: 2,
            creator: lobby.creator
        }));
    
    res.json({
        success: true,
        lobbies: publicLobbies
    });
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
            creator: player.id,
            isPublic: true,
            status: 'waiting',
            createdAt: new Date().toISOString()
        };

        lobbies.set(lobbyId, lobby);
        
        res.json({
            success: true,
            lobbyId: lobbyId,
            lobby: lobby
        });
        
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

        // Проверяем, не находится ли игрок уже в лобби
        if (lobby.players.some(p => p.id === player.id)) {
            return res.status(400).json({ error: 'Player already in lobby' });
        }

        lobby.players.push(player);
        
        // Если лобби заполнено, меняем статус
        if (lobby.players.length === 2) {
            lobby.status = 'ready';
        }

        // Уведомляем всех игроков через WebSocket
        broadcastToLobby(lobbyId, {
            type: 'player_joined',
            player: player,
            lobby: lobby
        });

        res.json({
            success: true,
            lobby: lobby
        });
        
    } catch (error) {
        console.error('Join lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/lobby/:id', (req, res) => {
    try {
        const lobby = lobbies.get(req.params.id);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        res.json({
            success: true,
            lobby: lobby
        });
        
    } catch (error) {
        console.error('Get lobby error:', error);
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
        
        // Если лобби пустое, удаляем его
        if (lobby.players.length === 0) {
            lobbies.delete(lobbyId);
        } else {
            // Если создатель вышел, назначаем нового
            if (lobby.creator.toString() === userId.toString()) {
                lobby.creator = lobby.players[0].id;
            }
            lobby.status = 'waiting';
        }

        broadcastToLobby(lobbyId, {
            type: 'player_left',
            userId: userId,
            lobby: lobby
        });

        res.json({
            success: true,
            lobby: lobby
        });
        
    } catch (error) {
        console.error('Leave lobby error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== WEB SOCKET ====================
const server = app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});

const wss = new WebSocketServer({ server });
const connections = new Map();

wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substr(2, 9);
    connections.set(connectionId, ws);
    
    console.log('New WebSocket connection:', connectionId);

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
        console.log('WebSocket connection closed:', connectionId);
    });
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function generateLobbyId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function broadcastToLobby(lobbyId, message) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    connections.forEach((ws, connId) => {
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('Broadcast error:', error);
        }
    });
}

function handleWebSocketMessage(connectionId, message) {
    const ws = connections.get(connectionId);
    if (!ws) return;

    switch (message.type) {
        case 'join_lobby':
            // Обработка присоединения к лобби через WS
            break;
        case 'game_move':
            // Обработка ходов игры
            break;
        default:
            console.log('Unknown message type:', message.type);
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
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;