import { getPluginServices } from './plugins';

export interface ServiceConfig {
  name: string;
  url: string;
  healthPath?: string;
}

export interface ServiceStatus extends ServiceConfig {
  online: boolean;
}

function parseEnvServices(): ServiceConfig[] {
  const raw = process.env.REGISTERED_SERVICES;
  if (!raw?.trim()) return [];
  try {
    return JSON.parse(raw) as ServiceConfig[];
  } catch {
    console.warn('[services] REGISTERED_SERVICES is not valid JSON — ignoring');
    return [];
  }
}

// Plugin services come first; REGISTERED_SERVICES env var can add or override entries.
export const registeredServices: ServiceConfig[] = [
  ...getPluginServices(),
  ...parseEnvServices(),
];

export async function checkServices(): Promise<ServiceStatus[]> {
  return Promise.all(
    registeredServices.map(async (svc) => {
      const healthUrl = svc.url.replace(/\/$/, '') + (svc.healthPath ?? '');
      try {
        const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
        return { ...svc, online: resp.ok };
      } catch {
        return { ...svc, online: false };
      }
    }),
  );
}
