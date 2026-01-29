
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    // Create the users table
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        points INTEGER DEFAULT 0,
        last_signin INTEGER DEFAULT 0,
        created_at INTEGER
      )
    `).run();

    // Create games table
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        creator_id TEXT,
        opponent_id TEXT,
        min_level INTEGER DEFAULT 0,
        status TEXT DEFAULT 'waiting', -- waiting, active, finished
        created_at INTEGER
      )
    `).run();

    return new Response(JSON.stringify({ 
      message: "Database initialized successfully (using run)." 
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
