
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, min_level } = await context.request.json() as { telegram_id: string, min_level: number };

    if (!telegram_id) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const game_id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const now = Date.now();

    try {
      await context.env.DB.prepare(
        "INSERT INTO games (id, creator_id, min_level, status, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(game_id, telegram_id, min_level || 0, 'waiting', now).run();
    } catch (e: any) {
      // Auto-create table if missing
      if (String(e.message).includes("no such table")) {
         await context.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                creator_id TEXT,
                opponent_id TEXT,
                min_level INTEGER DEFAULT 0,
                status TEXT DEFAULT 'waiting',
                created_at INTEGER
            )
         `).run();
         
         // Retry
         await context.env.DB.prepare(
            "INSERT INTO games (id, creator_id, min_level, status, created_at) VALUES (?, ?, ?, ?, ?)"
         ).bind(game_id, telegram_id, min_level || 0, 'waiting', now).run();
      } else {
        throw e;
      }
    }

    return new Response(JSON.stringify({ success: true, game_id }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
