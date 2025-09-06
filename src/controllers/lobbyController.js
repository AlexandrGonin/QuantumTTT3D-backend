const express = require('express');
const router = express.Router();

let lobbies = {}; // временно храним лобби в памяти

router.get('/list', (req, res) => {
    res.json({ lobbies: Object.values(lobbies) });
});

router.post('/create', (req, res) => {
    const { userId, lobbyName } = req.body;
    const lobbyId = `lobby-${Date.now()}`;
    const newLobby = { id: lobbyId, name: lobbyName || 'Quantum Lobby', host: userId, players: [{ id: userId, first_name: 'Player' }] };
    lobbies[lobbyId] = newLobby;
    res.json({ success: true, lobby: newLobby, message: 'Lobby created successfully' });
});

router.post('/:id/join', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    const lobby = lobbies[id];
    if (!lobby) return res.status(404).json({ success: false, error: 'Lobby not found' });

    if (!lobby.players.find(p => p.id === userId)) {
        lobby.players.push({ id: userId, first_name: 'Player' });
    }

    res.json({ success: true, lobby, message: 'Joined lobby successfully' });
});

router.post('/:id/leave', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    const lobby = lobbies[id];
    if (!lobby) return res.status(404).json({ success: false, error: 'Lobby not found' });

    lobby.players = lobby.players.filter(p => p.id !== userId);
    if (lobby.host === userId && lobby.players.length > 0) {
        lobby.host = lobby.players[0].id;
    } else if (lobby.players.length === 0) {
        delete lobbies[id];
    }

    res.json({ success: true, lobby });
});

router.post('/:id/start', (req, res) => {
    const { id } = req.params;
    const lobby = lobbies[id];
    if (!lobby) return res.status(404).json({ success: false, error: 'Lobby not found' });

    res.json({ success: true, lobby });
});

module.exports = router;
