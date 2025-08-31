const express = require('express');
const { validateTelegramData } = require('../utils/validation');
const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { initData } = req.body;
        
        console.log('Auth request received, initData:', initData ? 'present' : 'missing');
        
        if (!initData) {
            console.error('initData is required');
            return res.status(400).json({ error: 'initData is required' });
        }
        
        const isValid = validateTelegramData(
            initData,
            process.env.TELEGRAM_BOT_TOKEN
        );
        
        if (!isValid) {
            console.error('Invalid Telegram data');
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const initDataParams = new URLSearchParams(initData);
        const userDataRaw = initDataParams.get('user');
        
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

        const user = {
            id: userData.id,
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            username: userData.username || '',
            photo_url: userData.photo_url || '',
            language_code: userData.language_code || 'en'
        };
        
        console.log('User authenticated successfully:', user.id, user.first_name);
        
        res.json({
            success: true,
            user: user
        });
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;