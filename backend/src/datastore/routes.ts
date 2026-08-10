import type { FastifyInstance } from 'fastify';
import * as ds from './queries';

export const datastoreRoutes = async (app: FastifyInstance) => {
  // ── Tables ────────────────────────────────────────────────────────────────

  app.get('/datastore/tables', async () => ds.listTables());

  app.post('/datastore/tables', async (req, reply) => {
    const body = req.body as { name?: string };
    if (!body?.name?.trim()) return reply.code(400).send({ error: 'name is required' });
    try {
      const table = ds.createTable(body.name.trim());
      return reply.code(201).send(table);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to create table' });
    }
  });

  app.delete<{ Params: { tableId: string } }>('/datastore/tables/:tableId', async (req, reply) => {
    const ok = ds.dropTable(req.params.tableId);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Columns ───────────────────────────────────────────────────────────────

  app.get<{ Params: { tableId: string } }>('/datastore/tables/:tableId/columns', async (req, reply) => {
    const cols = ds.getColumns(req.params.tableId);
    return cols;
  });

  app.post<{ Params: { tableId: string } }>('/datastore/tables/:tableId/columns', async (req, reply) => {
    const body = req.body as { name?: string; colType?: string; isKey?: boolean };
    if (!body?.name?.trim()) return reply.code(400).send({ error: 'name is required' });
    const colType = (body.colType ?? 'text') as ds.ColType;
    if (!['text', 'number', 'boolean'].includes(colType)) return reply.code(400).send({ error: 'colType must be text, number, or boolean' });
    try {
      const col = ds.addColumn(req.params.tableId, body.name.trim(), colType, Boolean(body.isKey));
      return reply.code(201).send(col);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to add column' });
    }
  });

  app.patch<{ Params: { tableId: string; colId: string } }>('/datastore/tables/:tableId/columns/:colId', async (req, reply) => {
    const body = req.body as { name?: string; isKey?: boolean };
    const { tableId, colId } = req.params;
    try {
      if (body.isKey !== undefined) {
        const col = ds.setColumnKey(tableId, colId, Boolean(body.isKey));
        if (!col) return reply.code(404).send({ error: 'Not found' });
        return col;
      }
      if (!body?.name?.trim()) return reply.code(400).send({ error: 'name or isKey is required' });
      const col = ds.renameColumn(tableId, colId, body.name.trim());
      if (!col) return reply.code(404).send({ error: 'Not found' });
      return col;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to update column' });
    }
  });

  app.delete<{ Params: { tableId: string; colId: string } }>('/datastore/tables/:tableId/columns/:colId', async (req, reply) => {
    const ok = ds.dropColumn(req.params.tableId, req.params.colId);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Rows ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { tableId: string }; Querystring: { filter?: string } }>('/datastore/tables/:tableId/rows', async (req, reply) => {
    let filter: Record<string, unknown> | undefined;
    if (req.query.filter) {
      try { filter = JSON.parse(req.query.filter) as Record<string, unknown>; } catch {
        return reply.code(400).send({ error: 'filter must be valid JSON' });
      }
    }
    try {
      return ds.listRows(req.params.tableId, filter);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Query failed' });
    }
  });

  app.post<{ Params: { tableId: string } }>('/datastore/tables/:tableId/rows', async (req, reply) => {
    const body = req.body as { data?: Record<string, unknown> };
    if (!body?.data || typeof body.data !== 'object') return reply.code(400).send({ error: 'data object is required' });
    try {
      const result = ds.upsertRow(req.params.tableId, body.data);
      return reply.code(result.action === 'inserted' ? 201 : 200).send(result);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Upsert failed' });
    }
  });

  app.patch<{ Params: { tableId: string; rowId: string } }>('/datastore/tables/:tableId/rows/:rowId', async (req, reply) => {
    const body = req.body as { col?: string; value?: unknown };
    if (!body?.col) return reply.code(400).send({ error: 'col is required' });
    try {
      const row = ds.updateCell(req.params.tableId, req.params.rowId, body.col, body.value ?? null);
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return row;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Update failed' });
    }
  });

  app.delete<{ Params: { tableId: string; rowId: string } }>('/datastore/tables/:tableId/rows/:rowId', async (req, reply) => {
    const ok = ds.deleteRow(req.params.tableId, req.params.rowId);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  app.get<{ Params: { tableId: string } }>('/datastore/tables/:tableId/export', async (req, reply) => {
    try {
      const sql = ds.exportSql(req.params.tableId);
      return reply
        .header('Content-Disposition', `attachment; filename="table-${req.params.tableId}.sql"`)
        .header('Content-Type', 'text/plain; charset=utf-8')
        .send(sql);
    } catch (e) {
      return reply.code(404).send({ error: e instanceof Error ? e.message : 'Export failed' });
    }
  });
};
