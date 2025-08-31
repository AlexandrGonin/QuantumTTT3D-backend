const express = require('express');
const router = express.Router();

router.get('/list', (req, res) => {
    res.json({ lobbies: [] });
});

router.post('/create', (req, res) => {
    res.json({ 
        success: true, 
        lobbyId: 'temp-lobby-id',
        message: 'Lobby created successfully'
    });
});

router.post('/:id/join', (req, res) => {
    const lobbyId = req.params.id;
    res.json({ 
        success: true, 
        lobbyId: lobbyId,
        message: 'Joined lobby successfully'
    });
});

module.exports = router;