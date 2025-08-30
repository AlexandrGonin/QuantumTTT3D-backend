const express = require('express');
const router = express.Router();

/**
 * GET /lobby/list - Получить список лобби
 */
router.get('/list', (req, res) => {
    res.json({ lobbies: [] });
});

/**
 * POST /lobby/create - Создать новое лобби
 */
router.post('/create', (req, res) => {
    res.json({ 
        success: true, 
        lobbyId: 'temp-lobby-id',
        message: 'Lobby created successfully'
    });
});

/**
 * POST /lobby/:id/join - Присоединиться к лобби
 */
router.post('/:id/join', (req, res) => {
    const lobbyId = req.params.id;
    res.json({ 
        success: true, 
        lobbyId: lobbyId,
        message: 'Joined lobby successfully'
    });
});

module.exports = router;