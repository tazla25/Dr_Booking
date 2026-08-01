const { handleCallbackQuery } = require('./src/bot/handler');
jest = require('jest-mock');
require('./src/bot/session').setSession = async () => {};
require('./src/bot/session').getSession = async () => ({ step: 'AWAITING_LANG' });

const mockBot = {
  answerCallbackQuery: async () => console.log('answerCallbackQuery called'),
  sendMessage: async (chatId, text, opts) => console.log('sendMessage called with:', { chatId, text, opts })
};

const query = {
  id: '12345',
  data: 'lang_bn',
  message: {
    chat: { id: 123456789 }
  }
};

async function test() {
  await handleCallbackQuery(mockBot, query);
  console.log('DONE');
}
test().catch(console.error);
