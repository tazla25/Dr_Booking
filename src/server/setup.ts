import { Application } from 'express';
// @ts-ignore
import appConfig from '../app.js';
// @ts-ignore
import { createBot, registerWebhook } from '../bot/index.js';
// @ts-ignore
import { initReminderJob } from '../jobs/reminderJob.js';
// @ts-ignore
import { initFeedbackJob } from '../jobs/feedbackJob.js';
// @ts-ignore
import { initCleanupJob } from '../jobs/cleanupJob.js';

export const setupServer = (app: Application) => {
  const bot = createBot();
  app.set('bot', bot);

  // Use all middleware from the original app
  app.use(appConfig);

  // Register Webhooks
  registerWebhook(bot, app);

  // Initialize Jobs
  initReminderJob(bot);
  initFeedbackJob(bot);
  initCleanupJob();

  console.log('✅ Wasp custom server setup complete: WhatsApp bot and cron jobs initialized.');

  if (process.env.PUBLIC_URL) {
    const platform = (bot as any)._platform;
    if (platform && typeof platform.setWebhook === 'function') {
      platform
        .setWebhook(`${process.env.PUBLIC_URL}/webhook`)
        .then(() => console.log(`✅ WhatsApp webhook subscription checked: ${process.env.PUBLIC_URL}/webhook`))
        .catch((err: any) => console.error('❌ Webhook subscription error:', err.message));
    }
  }
};
