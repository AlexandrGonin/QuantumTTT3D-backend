const crypto = require('crypto');

function validateTelegramData(initDataRaw, botToken) {
  try {
    const initData = new URLSearchParams(initDataRaw);
    const hash = initData.get('hash');
    
    if (!hash) return false;

    // Создаем data-check-string
    initData.delete('hash');
    const dataCheckString = Array.from(initData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Создаем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    // Проверяем хеш
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