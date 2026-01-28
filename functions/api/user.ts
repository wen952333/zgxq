
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const telegram_id = url.searchParams.get("telegram_id");
  const username = url.searchParams.get("username") || "Unknown";

  if (!telegram_id) {
    return new Response(JSON.stringify({ error: "Missing telegram_id" }), { status: 400 });
  }

  try {
    // 1. Ensure Table Exists (Brute force safety for D1)
    // This is lightweight enough to run.
    await context.env.DB.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        points INTEGER DEFAULT 0,
        last_signin INTEGER DEFAULT 0,
        created_at INTEGER
      );
    `);

    // 2. Get User
    let user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();

    // 3. Create if not exists
    if (!user) {
      const now = Date.now();
      // Give 300 points start bonus
      await context.env.DB.prepare(
        "INSERT INTO users (telegram_id, username, points, last_signin, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(telegram_id, username, 300, 0, now).run();

      user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    }

    return new Response(JSON.stringify(user), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    // Return detailed error for debugging
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
    });
  }
}
