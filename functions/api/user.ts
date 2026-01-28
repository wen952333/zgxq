
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

async function ensureTable(db: D1Database) {
  // Auto-initialize users table if missing
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      username TEXT,
      points INTEGER DEFAULT 0,
      last_signin INTEGER DEFAULT 0,
      created_at INTEGER
    );
  `);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const telegram_id = url.searchParams.get("telegram_id");
  const username = url.searchParams.get("username") || "Unknown";

  if (!telegram_id) {
    return new Response(JSON.stringify({ error: "Missing telegram_id" }), { status: 400 });
  }

  const getUser = async () => context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();

  try {
    let user;
    
    try {
      user = await getUser();
    } catch (e: any) {
      // If error is likely "no such table", try to create it and retry
      if (e.message && (e.message.includes("no such table") || e.message.includes("prepare"))) {
         await ensureTable(context.env.DB);
         user = await getUser();
      } else {
         throw e;
      }
    }

    if (!user) {
      // Create user if not exists with 300 bonus points
      const now = Date.now();
      
      // Double check table existence before insert just in case
      try {
          await context.env.DB.prepare(
            "INSERT INTO users (telegram_id, username, points, last_signin, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(telegram_id, username, 300, 0, now).run();
      } catch (e: any) {
          if (e.message && (e.message.includes("no such table"))) {
              await ensureTable(context.env.DB);
              await context.env.DB.prepare(
                "INSERT INTO users (telegram_id, username, points, last_signin, created_at) VALUES (?, ?, ?, ?, ?)"
              ).bind(telegram_id, username, 300, 0, now).run();
          } else {
              throw e;
          }
      }

      user = await getUser();
    }

    return new Response(JSON.stringify(user), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
