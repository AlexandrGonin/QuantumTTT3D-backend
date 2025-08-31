const { validateTelegramData } = require('../utils/validation');

function authMiddleware(req, res, next) {
    try {
        const initData = req.headers['authorization'];
        
        if (!initData) {
            return res.status(401).json({ error: 'Authorization data required' });
        }
        
        const isValid = validateTelegramData(
            initData, 
            process.env.TELEGRAM_BOT_TOKEN
        );
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid authorization data' });
        }
        
        next();
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = authMiddleware;