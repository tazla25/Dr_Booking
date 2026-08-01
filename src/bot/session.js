const logger = require('../utils/logger');
const prisma = require('../database/prisma');

async function getSession(chatId) {
  try {
    const data = await prisma.botSession.findUnique({
      where: { chatId: String(chatId) }
    });

    if (!data) {
      return { step: 'IDLE' };
    }

    let parsedData = {};
    if (data.sessionData) {
      try {
        parsedData = JSON.parse(data.sessionData);
      } catch (e) {
        // ignore parse error
      }
    }

    return { step: data.step, ...parsedData };
  } catch (error) {
    logger.error(`[session] getSession error for ${chatId}:`, error.message);
    return { step: 'IDLE' };
  }
}

async function setSession(chatId, data) {
  try {
    const currentSession = await getSession(chatId);

    const nextStep = data.step !== undefined ? data.step : currentSession.step;
    const newData = { ...currentSession };
    delete newData.step; // Remove step from data

    for (const key in data) {
        if(key !== 'step') {
            newData[key] = data[key];
        }
    }

    await prisma.botSession.upsert({
      where: { chatId: String(chatId) },
      update: {
        step: nextStep,
        sessionData: JSON.stringify(newData)
      },
      create: {
        chatId: String(chatId),
        step: nextStep,
        sessionData: JSON.stringify(newData),
        lang: newData.lang || 'bn'
      }
    });
  } catch (error) {
    logger.error(`[session] setSession error for ${chatId}:`, error.message);
  }
}

async function clearSession(chatId) {
  try {
    await prisma.botSession.upsert({
      where: { chatId: String(chatId) },
      update: {
        step: 'IDLE',
        sessionData: '{}'
      },
      create: {
        chatId: String(chatId),
        step: 'IDLE',
        sessionData: '{}'
      }
    });
  } catch (error) {
    logger.error(`[session] clearSession error for ${chatId}:`, error.message);
  }
}

module.exports = { getSession, setSession, clearSession };
