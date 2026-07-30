// src/bot/session.js
// Supabase-backed session state machine keyed by chatId.
// Stores the conversation state for each user.

const supabase = require('../database/supabase');

async function getSession(chatId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('step, session_data')
    .eq('chat_id', chatId)
    .single();

  if (error || !data) {
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
    console.error(`[session] setSession error for ${chatId}:`, error.message);
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
    console.error(`[session] clearSession error for ${chatId}:`, error.message);
  }
}

module.exports = { getSession, setSession, clearSession };
