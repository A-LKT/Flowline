import type { FastifyInstance } from 'fastify';
import { checkServices, registeredServices } from '../services';

export const serviceRoutes = async (app: FastifyInstance) => {
  app.get('/services/status', async () => {
    if (registeredServices.length === 0) return [];
    return checkServices();
  });
};
