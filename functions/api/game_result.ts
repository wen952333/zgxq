
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, result } = await context.request.json() as { telegram_id: string, result: 'win' | 'loss' };

    if (!telegram_id || !result) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const user: any = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    let change = 0;
    let message = "";

    if (result === 'win') {
      // Win: +30 reward - 5 fee = +25
      change = 25;
      message = "胜利！获得 30 积分 (扣除 5 积分房费)";
    } else {
      // Lose: -30
      change = -30;
      message = "惜败！扣除 30 积分";
    }

    let newPoints = (user.points || 0) + change;
    // Prevent negative points? Optional, but let's allow it or cap at 0.
    // Assuming debt is allowed or just cap at 0. Let's cap at 0 for simplicity.
    if (newPoints < 0) newPoints = 0;

    await context.env.DB.prepare("UPDATE users SET points = ? WHERE telegram_id = ?")
      .bind(newPoints, telegram_id)
      .run();

    return new Response(JSON.stringify({ success: true, points: newPoints, message }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
