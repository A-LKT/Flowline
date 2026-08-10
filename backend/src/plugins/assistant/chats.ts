import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { db } from '../../db';
import type { ChatScope } from './tools';
import { EMPTY_SCOPE } from './tools';

// Persistence for assistant chats. Tables are created by the plugin's migrate
// hook, so they exist only in premium builds (the plugin loads only when licensed).

export type ChatSummary = { id: string; title: string; provider: string | null; model: string | null; updatedAt: number };
export type ChatRecord = ChatSummary & { scope: ChatScope; createdAt: number };
export type StoredMessage = {
  id: string; role: 'user' | 'assistant'; content: string;
  trace?: unknown; proposals?: unknown; createdAt: number;
};

export function createChatTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS assistant_chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      scope TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES assistant_chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS assistant_messages_chat ON assistant_messages(chat_id, created_at ASC);
  `);
}

type ChatDbRow = { id: string; title: string; provider: string | null; model: string | null; scope: string | null; created_at: number; updated_at: number };
type MsgDbRow = { id: string; role: string; content: string; meta: string | null; created_at: number };

const parseScope = (s: string | null): ChatScope => {
  if (!s) return EMPTY_SCOPE;
  try { return { ...EMPTY_SCOPE, ...(JSON.parse(s) as Partial<ChatScope>) }; } catch { return EMPTY_SCOPE; }
};

export function listChats(): ChatSummary[] {
  return (db.prepare('SELECT id, title, provider, model, updated_at FROM assistant_chats ORDER BY updated_at DESC').all() as Omit<ChatDbRow, 'scope' | 'created_at'>[])
    .map((r) => ({ id: r.id, title: r.title, provider: r.provider, model: r.model, updatedAt: r.updated_at }));
}

export function createChat(opts: { title?: string; provider?: string; model?: string }): ChatRecord {
  const now = Date.now();
  const id = randomUUID();
  db.prepare('INSERT INTO assistant_chats (id, title, provider, model, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, opts.title ?? 'New chat', opts.provider ?? null, opts.model ?? null, JSON.stringify(EMPTY_SCOPE), now, now);
  return getChat(id)!;
}

export function getChat(id: string): ChatRecord | null {
  const r = db.prepare('SELECT * FROM assistant_chats WHERE id = ?').get(id) as ChatDbRow | undefined;
  if (!r) return null;
  return { id: r.id, title: r.title, provider: r.provider, model: r.model, scope: parseScope(r.scope), createdAt: r.created_at, updatedAt: r.updated_at };
}

export function getMessages(chatId: string): StoredMessage[] {
  return (db.prepare('SELECT id, role, content, meta, created_at FROM assistant_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId) as MsgDbRow[])
    .map((m) => {
      const meta = m.meta ? (JSON.parse(m.meta) as { trace?: unknown; proposals?: unknown }) : {};
      return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content, trace: meta.trace, proposals: meta.proposals, createdAt: m.created_at };
    });
}

export function updateChat(id: string, patch: { title?: string; provider?: string; model?: string; scope?: ChatScope }): ChatRecord | null {
  const cur = getChat(id);
  if (!cur) return null;
  const next = {
    title:    patch.title    ?? cur.title,
    provider: patch.provider ?? cur.provider,
    model:    patch.model    ?? cur.model,
    scope:    patch.scope    ?? cur.scope,
  };
  db.prepare('UPDATE assistant_chats SET title = ?, provider = ?, model = ?, scope = ?, updated_at = ? WHERE id = ?')
    .run(next.title, next.provider, next.model, JSON.stringify(next.scope), Date.now(), id);
  return getChat(id);
}

export function touchChat(id: string): void {
  db.prepare('UPDATE assistant_chats SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function deleteChat(id: string): boolean {
  return db.prepare('DELETE FROM assistant_chats WHERE id = ?').run(id).changes > 0;
}

export function addMessage(m: { chatId: string; role: 'user' | 'assistant'; content: string; meta?: unknown }): StoredMessage {
  const now = Date.now();
  const id = randomUUID();
  db.prepare('INSERT INTO assistant_messages (id, chat_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, m.chatId, m.role, m.content, m.meta ? JSON.stringify(m.meta) : null, now);
  const meta = (m.meta ?? {}) as { trace?: unknown; proposals?: unknown };
  return { id, role: m.role, content: m.content, trace: meta.trace, proposals: meta.proposals, createdAt: now };
}
