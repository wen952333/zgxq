
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, result } = await context.request.json() as { telegram_id: string, result: 'win' | 'loss' | 'draw' };

    if (!telegram_id || !result) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const user: any = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    // Logic: User has ALREADY paid 30 points to enter.
    // Win: Refund 30 + Reward 25 = +55
    // Loss: Refund 0 = +0 (Net -30)
    // Draw: Refund 30 = +30 (Net 0)

    let change = 0;
    let message = "";

    if (result === 'win') {
      change = 55; 
      message = "胜利！赢取 25 积分 (已返还入场费)";
    } else if (result === 'draw') {
      change = 30;
      message = "和棋，返还入场费";
    } else {
      change = 0;
      message = "惜败！(扣除入场费)";
    }

    let newPoints = (user.points || 0) + change;

    if (change > 0) {
        await context.env.DB.prepare("UPDATE users SET points = ? WHERE telegram_id = ?")
        .bind(newPoints, telegram_id)
        .run();
    }

    return new Response(JSON.stringify({ success: true, points: newPoints, message }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
