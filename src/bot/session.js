// src/bot/session.js
// Supabase-backed session state machine keyed by chatId.
// Stores the conversation state for each user.

const supabase = require('../database/supabase');
const logger = require('../utils/logger');
const { AppointmentError } = require('../utils/errors');

async function getSession(chatId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('step, session_data')
    .eq('chat_id', chatId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found" which is normal for new sessions
     logger.error({ err: error, chatId }, 'Error fetching session');
  }

  if (!data) {
    return { step: 'IDLE' };
  }

  return { step: data.step, ...data.session_data };
}

async function setSession(chatId, data) {
  const currentSession = await getSession(chatId);

  const nextStep = data.step !== undefined ? data.step : currentSession.step;
  const newData = { ...currentSession };
  delete newData.step; // Remove step from data

  for (const key in data) {
      if(key !== 'step') {
          newData[key] = data[key];
      }
  }

  const { error } = await supabase
    .from('sessions')
    .upsert({
      chat_id: chatId,
      step: nextStep,
      session_data: newData
    }, { onConflict: 'chat_id' });

  if (error) {
    logger.error({ err: error, chatId, data }, 'Error setting session');
    throw new AppointmentError('Failed to save session state', 'SESSION_SAVE_ERROR', 'দুঃখিত, একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।');
  }
}

async function clearSession(chatId) {
  const { error } = await supabase
    .from('sessions')
    .upsert({
      chat_id: chatId,
      step: 'IDLE',
      session_data: {}
    }, { onConflict: 'chat_id' });

  if (error) {
    logger.error({ err: error, chatId }, 'Error clearing session');
    throw new AppointmentError('Failed to clear session state', 'SESSION_CLEAR_ERROR', 'দুঃখিত, একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।');
  }
}

module.exports = { getSession, setSession, clearSession };
