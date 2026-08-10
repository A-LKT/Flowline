import { plugin as voiceToText } from './voice-to-text';
import { plugin as ollama }      from './ollama';
import { plugin as aiLlm }       from './ai-llm';
import { plugin as assistant }   from './assistant';
import { plugin as housekeeping } from './housekeeping';
import { plugin as artifactHistory } from './artifact-history';
import { features } from '../edition';

import type { Plugin, PluginManifest } from './types';
export type { Plugin, PluginManifest } from './types';

// Premium plugins ship in-tree but load only when the verified license grants that
// specific feature (see ../edition and license/verify.ts). Gating per-feature — not a
// single premium boolean — lets a license unlock a subset, matching the `--features`
// flag on the license issuer. Their side effects live in migrate/init/routes hooks,
// which server.ts runs only for plugins present in this array, so an unlicensed build
// loads no tables, schedulers, or routes for them.
export const plugins: Plugin[] = [
  voiceToText,
  ollama,
  aiLlm,
  ...(features.assistant ? [assistant] : []),
  ...(features.housekeeping ? [housekeeping] : []),
  ...(features.artifactHistory ? [artifactHistory] : []),
];

export type PluginServiceConfig = {
  name: string;
  url: string;
  healthPath?: string;
};

export function getPluginServices(): PluginServiceConfig[] {
  return plugins
    .filter((p): p is Plugin & { manifest: PluginManifest & { service: NonNullable<PluginManifest['service']> } } =>
      !!p.manifest?.service,
    )
    .map((p) => ({
      name: p.manifest.service.displayName,
      url:  process.env[p.manifest.service.envVar] ?? p.manifest.service.defaultUrl,
      healthPath: p.manifest.service.healthPath,
    }));
}
