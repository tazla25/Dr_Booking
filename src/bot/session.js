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
    // Bug 1 fix: preserve the user's language preference when clearing session.
    // Previously, clearSession set sessionData: '{}' which wiped lang from the
    // JSON blob. The next getSession() call would then return no lang, causing
    // the handler to default to 'bn' (Bengali) — even if the user had selected
    // English or Hindi.
    const existing = await prisma.botSession.findUnique({
      where: { chatId: String(chatId) }
    });

    let preservedLang = 'bn';
    if (existing) {
      // Try to read lang from sessionData JSON first
      try {
        const parsed = JSON.parse(existing.sessionData || '{}');
        if (parsed.lang) preservedLang = parsed.lang;
      } catch (e) { /* ignore */ }
      // Fall back to the lang column if sessionData didn't have it
      if (existing.lang && !preservedLang) preservedLang = existing.lang;
    }

    await prisma.botSession.upsert({
      where: { chatId: String(chatId) },
      update: {
        step: 'IDLE',
        sessionData: JSON.stringify({ lang: preservedLang }),
        lang: preservedLang,
      },
      create: {
        chatId: String(chatId),
        step: 'IDLE',
        sessionData: JSON.stringify({ lang: preservedLang }),
        lang: preservedLang,
      }
    });
  } catch (error) {
    logger.error(`[session] clearSession error for ${chatId}:`, error.message);
  }
}

module.exports = { getSession, setSession, clearSession };
