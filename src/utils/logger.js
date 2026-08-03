const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction ? {} : {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  })
});

/**
 * Log an error with structured context. In production with ERROR_WEBHOOK_URL
 * set, also fires a notification to the configured webhook (Slack/Discord).
 *
 * @param {Error|Object} error - the error object
 * @param {Object} context - additional context (chatId, userId, etc.)
 */
logger.errorWithContext = async function (error, context = {}) {
  const errObj = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      err: {
        message: errObj.message,
        stack: errObj.stack,
        code: errObj.code,
      },
      ...context,
    },
    errObj.message
  );

  // Fire-and-forget webhook notification
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (webhookUrl && isProduction) {
    try {
      const payload = {
        text: `🚨 *Dr_Booking Error*`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Message', value: errObj.message, short: false },
            ...(context.chatId ? [{ title: 'Chat ID', value: String(context.chatId), short: true }] : []),
            ...(context.userId ? [{ title: 'User ID', value: String(context.userId), short: true }] : []),
            { title: 'Timestamp', value: new Date().toISOString(), short: true },
          ],
          text: '```' + (errObj.stack || errObj.message).split('\n').slice(0, 10).join('\n') + '```',
        }],
      };
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      logger.warn({ err: e.message }, 'Failed to send error webhook');
    }
  }
};

module.exports = logger;
