const express = require('express');
const { validateTelegramData } = require('../utils/validation');
const router = express.Router();

/**
 * Роут для аутентификации пользователя
 * POST /auth
 */
router.post('/', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'initData is required' });
        }
        
        // Проверяем валидность данных
        const isValid = validateTelegramData(
            initData,
            process.env.TELEGRAM_BOT_TOKEN
        );
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        // Парсим данные пользователя
        const initDataParams = new URLSearchParams(initData);
        const userDataRaw = initDataParams.get('user');
        
        if (!userDataRaw) {
            return res.status(400).json({ error: 'User data not found' });
        }
        
        const userData = JSON.parse(userDataRaw);
        
        // Здесь в будущем можно сохранить пользователя в БД
        // Пока просто возвращаем успешный ответ с данными пользователя
        res.json({
            success: true,
            user: {
                id: userData.id,
                first_name: userData.first_name,
                last_name: userData.last_name,
                username: userData.username,
                photo_url: userData.photo_url
            }
        });
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;