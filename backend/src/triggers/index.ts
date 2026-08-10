import { registerAdapter, startAllTriggers, startTrigger, stopTrigger, getAdapter } from './registry';
import { scheduleAdapter }  from './scheduleAdapter';
import { fileWatchAdapter } from './fileWatchAdapter';
import { emailAdapter }     from './emailAdapter';

registerAdapter('schedule',   scheduleAdapter);
registerAdapter('file-watch', fileWatchAdapter);
registerAdapter('email',      emailAdapter);
// 'webhook' is HTTP-driven — no persistent adapter needed; handled entirely in routes/triggers.ts

export { registerAdapter, getAdapter, startTrigger, stopTrigger, startAllTriggers };
