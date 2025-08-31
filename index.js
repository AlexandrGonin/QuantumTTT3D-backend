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
const gameUpdates = new Map(); // Для HTTP long-polling

// Очистка пустых лобби каждые 5 минут
setInterval(cleanupEmptyLobbies, 5 * 60 * 1000);
// Очистка старых gameUpdates каждые 10 минут
setInterval(cleanupOldGameUpdates, 10 * 60 * 1000);

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
        
        // Добавляем обновление о новом игроке
        addGameUpdate(lobbyId, {
            type: 'player_joined',
            player: player,
            lobby: lobby,
            timestamp: Date.now()
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
        
        // Добавляем обновление о выходе игрока
        addGameUpdate(lobbyId, {
            type: 'player_left',
            userId: userId,
            lobby: lobby,
            timestamp: Date.now()
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
            currentPlayer: lobby.players[0].id,
            players: lobby.players.map((p, index) => ({
                id: p.id,
                symbol: index === 0 ? 'X' : 'O',
                name: p.first_name
            })),
            moves: []
        };

        // Добавляем обновление о начале игры
        addGameUpdate(lobbyId, {
            type: 'game_started',
            lobby: lobby,
            timestamp: Date.now()
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

// ==================== HTTP LONG-POLLING ДЛЯ ИГРЫ ====================
app.post('/game/poll', (req, res) => {
    try {
        const { lobbyId, userId, lastUpdate = 0 } = req.body;
        
        if (!lobbyId || !userId) {
            return res.status(400).json({ error: 'lobbyId and userId are required' });
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        // Проверяем что пользователь в лобби
        const playerInLobby = lobby.players.some(p => p.id.toString() === userId.toString());
        if (!playerInLobby) {
            return res.status(403).json({ error: 'Player not in lobby' });
        }

        // Получаем обновления после lastUpdate
        const updates = gameUpdates.get(lobbyId) || [];
        const newUpdates = updates.filter(update => update.timestamp > lastUpdate);
        
        res.json({
            success: true,
            updates: newUpdates,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Poll error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/game/send', (req, res) => {
    try {
        const { lobbyId, userId, message } = req.body;
        
        if (!lobbyId || !userId || !message) {
            return res.status(400).json({ error: 'lobbyId, userId and message are required' });
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            return res.status(404).json({ error: 'Lobby not found' });
        }

        // Проверяем что пользователь в лобби
        const playerInLobby = lobby.players.some(p => p.id.toString() === userId.toString());
        if (!playerInLobby) {
            return res.status(403).json({ error: 'Player not in lobby' });
        }

        // Обрабатываем不同类型的 сообщения
        if (message.type === 'game_move') {
            handleGameMove(lobbyId, userId, message);
        } else {
            // Для других типов сообщений просто добавляем в обновления
            addGameUpdate(lobbyId, {
                ...message,
                userId: userId,
                timestamp: Date.now()
            });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Send error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function handleGameMove(lobbyId, userId, message) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing') return;

    const { move } = message;
    const { x, y, z, symbol } = move;

    // Проверяем что ход делает текущий игрок
    if (userId !== lobby.gameState.currentPlayer) {
        addGameUpdate(lobbyId, {
            type: 'error',
            message: 'Not your turn',
            userId: userId,
            timestamp: Date.now()
        });
        return;
    }

    // Проверяем что символ совпадает
    const player = lobby.gameState.players.find(p => p.id.toString() === userId.toString());
    if (!player || player.symbol !== symbol) {
        addGameUpdate(lobbyId, {
            type: 'error',
            message: 'Invalid symbol',
            userId: userId,
            timestamp: Date.now()
        });
        return;
    }

    // Проверяем что клетка свободна
    const index = (x + 1) * 9 + (y + 1) * 3 + (z + 1);
    if (lobby.gameState.board[index] !== null) {
        addGameUpdate(lobbyId, {
            type: 'error',
            message: 'Cell already occupied',
            userId: userId,
            timestamp: Date.now()
        });
        return;
    }

    // Делаем ход
    lobby.gameState.board[index] = symbol;
    lobby.gameState.moves.push({ x, y, z, symbol, player: userId });

    // Проверяем победу
    const winner = checkWin(lobby.gameState.board, symbol);
    if (winner) {
        lobby.status = 'finished';
        lobby.gameState.winner = winner;
        
        addGameUpdate(lobbyId, {
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
        
        addGameUpdate(lobbyId, {
            type: 'game_ended',
            lobby: lobby,
            winner: 'draw',
            timestamp: Date.now()
        });
        
        return;
    }

    // Передаем ход следующему игроку
    const currentPlayerIndex = lobby.gameState.players.findIndex(p => p.id.toString() === lobby.gameState.currentPlayer.toString());
    const nextPlayerIndex = (currentPlayerIndex + 1) % lobby.gameState.players.length;
    lobby.gameState.currentPlayer = lobby.gameState.players[nextPlayerIndex].id;

    // Добавляем обновление игры
    addGameUpdate(lobbyId, {
        type: 'game_update',
        gameState: lobby.gameState,
        move: move,
        timestamp: Date.now()
    });
}

// ==================== WEB SOCKET (Оставлено для обратной совместимости) ====================
const server = app.listen(PORT, () => {
    console.log('Server running on port', PORT);
    console.log('HTTP long-polling available at:', API_BASE_URL);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('WebSocket connection attempted - using HTTP long-polling instead');
    
    // Закрываем WebSocket соединение и сообщаем о использовании HTTP
    ws.send(JSON.stringify({
        type: 'error',
        message: 'WebSocket not supported. Please use HTTP long-polling.',
        timestamp: Date.now()
    }));
    
    ws.close(1000, 'Use HTTP long-polling');
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function addGameUpdate(lobbyId, update) {
    if (!gameUpdates.has(lobbyId)) {
        gameUpdates.set(lobbyId, []);
    }
    
    const updates = gameUpdates.get(lobbyId);
    updates.push(update);
    
    // Ограничиваем количество хранимых обновлений
    if (updates.length > 100) {
        gameUpdates.set(lobbyId, updates.slice(-50));
    }
}

function generateLobbyId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function cleanupEmptyLobbies() {
    const now = Date.now();
    let removedCount = 0;
    
    lobbies.forEach((lobby, lobbyId) => {
        if (lobby.players.length === 0 || (now - lobby.createdAt > 60 * 60 * 1000)) {
            lobbies.delete(lobbyId);
            gameUpdates.delete(lobbyId);
            removedCount++;
        }
    });
    
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} empty lobbies`);
    }
}

function cleanupOldGameUpdates() {
    const now = Date.now();
    let cleanedCount = 0;
    
    gameUpdates.forEach((updates, lobbyId) => {
        // Удаляем обновления старше 1 часа
        const freshUpdates = updates.filter(update => now - update.timestamp < 60 * 60 * 1000);
        
        if (freshUpdates.length === 0) {
            gameUpdates.delete(lobbyId);
            cleanedCount++;
        } else if (freshUpdates.length < updates.length) {
            gameUpdates.set(lobbyId, freshUpdates);
            cleanedCount++;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`Cleaned up old game updates from ${cleanedCount} lobbies`);
    }
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

// ==================== БАЗОВЫЕ ЭНДПОИНТЫ ====================
app.get('/', (req, res) => {
    res.json({ 
        message: 'Quantum 3D Tic-Tac-Toe Backend is running!',
        lobbiesCount: lobbies.size,
        playersCount: players.size,
        connectionType: 'HTTP long-polling'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        stats: {
            lobbies: lobbies.size,
            players: players.size,
            gameUpdates: gameUpdates.size
        }
    });
});

// Очистка при завершении
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app;