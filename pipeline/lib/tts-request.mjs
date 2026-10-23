// Typecast single-speaker and composed dialogue requests. No network or credentials.
export function dialogueTurns(voice, cut) {
  if (cut.dialogue === undefined) return null;
  if (!Array.isArray(cut.dialogue) || !cut.dialogue.length) throw new Error(`${cut.id}: dialogue must contain turns`);
  const turns = cut.dialogue.map(turn => {
    if (!turn || typeof turn.say !== 'string' || !turn.say.trim()) throw new Error(`${cut.id}: empty dialogue turn`);
    const actor = voice.speakers?.[turn.speaker];
    if (!actor?.voice_id) throw new Error(`${cut.id}: unknown speaker ${turn.speaker}`);
    return { ...turn, actor };
  });
  const normalize = text => text.trim().replace(/\s+/g, ' ');
  if (normalize(turns.map(t => t.say).join(' ')) !== normalize(cut.say || '')) throw new Error(`${cut.id}: dialogue and say differ`);
  return turns;
}

export function typecastRequest(voice, cut) {
  const make = (text, actor = {}, turn = {}) => ({
    text, model: actor.model || voice.model || 'ssfm-v30', voice_id: actor.voice_id || voice.voice_id,
    language: voice.language || 'kor',
    prompt: { emotion_preset: turn.emotion || cut.emotion || voice.emotion || 'normal',
      ...((turn.emotion_intensity ?? cut.emotion_intensity) != null ? { emotion_intensity: turn.emotion_intensity ?? cut.emotion_intensity } : {}) },
    ...(voice.seed != null ? { seed: voice.seed } : {}),
    output: { audio_format: 'wav', ...(voice.target_lufs != null ? { target_lufs: voice.target_lufs } : {}) },
  });
  const turns = dialogueTurns(voice, cut);
  if (!turns) return { endpoint: 'https://api.typecast.ai/v1/text-to-speech', body: make(cut.say) };
  const segments = turns.map(turn => ({ type: 'tts', ...make(turn.say, turn.actor, turn) }));
  if (segments.length > 50 || turns.reduce((n, t) => n + [...t.say].length, 0) > 2000) throw new Error(`${cut.id}: compose request limit exceeded`);
  return { endpoint: 'https://api.typecast.ai/v1/text-to-speech/compose', body: { segments } };
}
