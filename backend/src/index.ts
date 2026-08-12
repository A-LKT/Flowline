import './auth/internalToken'; // FIRST: seeds INTERNAL_RUN_TOKEN before the worker pool spawns
import { buildServer } from './server';
import { AuthConfigError } from './auth/config';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const start = async () => {
  let app;
  try {
    app = await buildServer();
  } catch (err) {
    if (err instanceof AuthConfigError) {
      // Fail-closed: no login credential configured. Report clearly and stop,
      // rather than starting an unauthenticated instance.
      console.error(`\n[auth] Refusing to start: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
