const crypto = require('crypto');

/**
 * Проверяет подлинность данных, полученных от Telegram Web App
 * @param {string} initDataRaw - Строка с данными от Telegram
 * @param {string} botToken - Токен вашего бота от @BotFather
 * @returns {boolean} - True если данные валидны, false если нет
 */
function validateTelegramData(initDataRaw, botToken) {
    // Парсим строку с данными в URLSearchParams для удобства работы
    const initData = new URLSearchParams(initDataRaw);
    
    // Извлекаем хеш, который прислал Telegram для проверки
    const hash = initData.get('hash');
    
    // Создаем временную метку из данных
    const receivedTimestamp = parseInt(initData.get('auth_date'));
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    // Проверяем, не устарели ли данные (больше 1 часа)
    if (currentTimestamp - receivedTimestamp > 3600) {
        return false;
    }
    
    // Удаляем хеш из данных, так как его не нужно включать в проверку
    initData.delete('hash');
    
    // Сортируем параметры по алфавиту и формируем строку для проверки
    const dataCheckString = Array.from(initData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    // Создаем секретный ключ используя HMAC-SHA256 и токен бота
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    
    // Вычисляем хеш из полученных данных с использованием секретного ключа
    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    
    // Сравниваем полученный хеш с вычисленным
    return calculatedHash === hash;
}

module.exports = { validateTelegramData };