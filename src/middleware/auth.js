const { validateTelegramData } = require('../utils/validation');

/**
 * Middleware для проверки аутентификации пользователя
 */
function authMiddleware(req, res, next) {
    try {
        // Получаем данные авторизации из заголовка
        const initData = req.headers['authorization'];
        
        if (!initData) {
            return res.status(401).json({ error: 'Authorization data required' });
        }
        
        // Проверяем валидность данных через нашу функцию
        const isValid = validateTelegramData(
            initData, 
            process.env.TELEGRAM_BOT_TOKEN
        );
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid authorization data' });
        }
        
        // Если данные валидны, пропускаем запрос дальше
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = authMiddleware;