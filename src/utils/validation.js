const crypto = require('crypto');

function validateTelegramData(initDataRaw, botToken) {
    try {
        const initData = new URLSearchParams(initDataRaw);
        const hash = initData.get('hash');
        
        if (!hash) return false;

        const receivedTimestamp = parseInt(initData.get('auth_date'));
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        if (currentTimestamp - receivedTimestamp > 3600) {
            return false;
        }

        initData.delete('hash');
        
        const dataCheckString = Array.from(initData.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        const calculatedHash = crypto.createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        return calculatedHash === hash;
        
    } catch (error) {
        return false;
    }
}

module.exports = { validateTelegramData };