// src/utils/validation.js
const crypto = require('crypto');

function validateTelegramData(initDataRaw, botToken) {
    try {
        console.log('Validating Telegram data...');
        
        const initData = new URLSearchParams(initDataRaw);
        const hash = initData.get('hash');
        
        if (!hash) {
            console.log('No hash found in initData');
            return false;
        }

        const receivedTimestamp = parseInt(initData.get('auth_date'));
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        if (currentTimestamp - receivedTimestamp > 3600) {
            console.log('Telegram data expired');
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

        const isValid = calculatedHash === hash;
        
        if (!isValid) {
            console.log('Hash validation failed');
            console.log('Expected:', hash);
            console.log('Calculated:', calculatedHash);
            console.log('Data check string:', dataCheckString);
        } else {
            console.log('Telegram data validation successful');
        }
        
        return isValid;
        
    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

module.exports = { validateTelegramData };