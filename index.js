const express = require('express');
const cors = require('cors');
const { validateTelegramData } = require('./src/utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is required');
    process.exit(1);
}

console.log('Server starting on port:', PORT);

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Quantum 3D Tic-Tac-Toe Backend is running!' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.post('/auth', (req, res) => {
    try {
        console.log('Auth request received');
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ 
                success: false,
                error: 'initData is required' 
            });
        }

        const isValid = validateTelegramData(initData, TELEGRAM_BOT_TOKEN);
        
        if (!isValid) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid Telegram authentication data' 
            });
        }

        const urlParams = new URLSearchParams(initData);
        const userDataStr = urlParams.get('user');
        
        if (!userDataStr) {
            return res.status(400).json({ 
                success: false,
                error: 'User data not found in initData' 
            });
        }

        const userData = JSON.parse(userDataStr);
        
        res.json({
            success: true,
            user: {
                id: userData.id,
                first_name: userData.first_name,
                last_name: userData.last_name || '',
                username: userData.username || '',
                language_code: userData.language_code || 'en',
                is_premium: userData.is_premium || false
            }
        });
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error' 
        });
    }
});

app.post('/api/auth', (req, res) => {
    console.log('API auth request');
    handleAuth(req, res);
});

function handleAuth(req, res) {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'initData is required' });
        }
        
        res.json({
            success: true,
            user: {
                id: Math.floor(Math.random() * 1000000000),
                first_name: 'User',
                last_name: 'Test',
                username: 'testuser'
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

app.get('/lobby/list', (req, res) => {
    res.json({
        success: true,
        lobbies: []
    });
});

app.post('/lobby/create', (req, res) => {
    res.json({ 
        success: true, 
        lobbyId: 'lobby-' + Date.now()
    });
});

app.post('/lobby/join', (req, res) => {
    res.json({ 
        success: true, 
        lobbyId: 'joined-lobby'
    });
});

app.use((req, res, next) => {
    console.log('Request:', req.method, req.url);
    next();
});

app.use((req, res) => {
    console.log('404 Not Found:', req.method, req.url);
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});