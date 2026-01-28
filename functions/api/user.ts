
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
    // 1. Try to get user
    let user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();

    // 2. If user not found (but table exists), create user
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
    const errStr = String(e.message || e);
    
    // 3. Handle "no such table" error by creating table and retrying
    if (errStr.includes("no such table")) {
      try {
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

        // Retry creating user
        const now = Date.now();
        await context.env.DB.prepare(
            "INSERT INTO users (telegram_id, username, points, last_signin, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(telegram_id, username, 300, 0, now).run();

        const user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
        
        return new Response(JSON.stringify(user), {
            headers: { "Content-Type": "application/json" }
        });
      } catch (retryErr: any) {
         return new Response(JSON.stringify({ error: "Failed to auto-create table/user", details: retryErr.message }), { status: 500 });
      }
    }

    // Return detailed error for debugging
    return new Response(JSON.stringify({ error: e.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
    });
  }
}
