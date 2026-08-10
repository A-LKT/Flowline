import './transcribeNode';
import type { Plugin } from '../types';

export const plugin: Plugin = {
  name: 'voice-to-text',
  manifest: {
    service: {
      displayName: 'Voice to Text',
      envVar:      'VOICE_TO_TEXT_URL',
      defaultUrl:  'http://voice-to-text:9000',
      healthPath:  '/health',
    },
  },
};
