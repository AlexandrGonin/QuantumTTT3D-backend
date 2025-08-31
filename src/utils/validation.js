const crypto = require('crypto');

function validateTelegramData(initDataRaw, botToken) {
    try {
        const initData = typeof initDataRaw === 'string' 
            ? new URLSearchParams(initDataRaw)
            : initDataRaw;

        const hash = initData.get('hash');
        
        if (!hash) {
            console.error('No hash found in initData');
            return false;
        }

        const receivedTimestamp = parseInt(initData.get('auth_date'));
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        if (currentTimestamp - receivedTimestamp > 86400) {
            console.error('Auth data expired');
            return false;
        }

        const dataToCheck = new URLSearchParams();
        for (const [key, value] of initData.entries()) {
            if (key !== 'hash') {
                dataToCheck.append(key, value);
            }
        }

        const dataCheckString = Array.from(dataToCheck.entries())
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
        console.error('Validation error:', error);
        return false;
    }
}

module.exports = { validateTelegramData };