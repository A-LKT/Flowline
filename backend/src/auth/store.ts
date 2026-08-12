import { db } from '../db';

// Query helpers for the users & sessions tables (created in db.ts). Kept beside the
// auth logic rather than in db.ts to keep the two auth concerns cohesive. Importing
// `db` runs db.ts's table creation first, so these prepared statements are safe.

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen: number;
}

const stmts = {
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  upsertUser: db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
    VALUES (@id, @username, @passwordHash, @role, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      username = @username, password_hash = @passwordHash, role = @role, updated_at = @now
  `),

  insertSession: db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen)
    VALUES (@tokenHash, @userId, @now, @expiresAt, @now)
  `),
  getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  touchSession: db.prepare('UPDATE sessions SET last_seen = @now, expires_at = @expiresAt WHERE token_hash = @tokenHash'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
};

export const getUserById = (id: string): UserRow | undefined =>
  stmts.getUserById.get(id) as UserRow | undefined;

export const getUserByUsername = (username: string): UserRow | undefined =>
  stmts.getUserByUsername.get(username) as UserRow | undefined;

export const upsertUser = (u: { id: string; username: string; passwordHash: string; role: string }): void => {
  stmts.upsertUser.run({ ...u, now: Date.now() });
};

export const insertSession = (tokenHash: string, userId: string, expiresAt: number): void => {
  stmts.insertSession.run({ tokenHash, userId, expiresAt, now: Date.now() });
};

export const getSession = (tokenHash: string): SessionRow | undefined =>
  stmts.getSession.get(tokenHash) as SessionRow | undefined;

export const touchSession = (tokenHash: string, expiresAt: number): void => {
  stmts.touchSession.run({ tokenHash, expiresAt, now: Date.now() });
};

export const deleteSession = (tokenHash: string): void => {
  stmts.deleteSession.run(tokenHash);
};

export const deleteSessionsForUser = (userId: string): void => {
  stmts.deleteSessionsForUser.run(userId);
};

export const deleteExpiredSessions = (now: number = Date.now()): number =>
  stmts.deleteExpiredSessions.run(now).changes;
