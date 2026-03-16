import { applyAudioEffect } from '../../lib/audioEffects.js';
export default {
  name: 'karaoke',
  alias: ['novocal'],
  description: 'Remove vocals (karaoke mode)',
  category: 'audio',
  async execute(sock, m, args) { await applyAudioEffect(sock, m, 'karaoke'); }
};
