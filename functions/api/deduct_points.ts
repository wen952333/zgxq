
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, amount } = await context.request.json() as { telegram_id: string, amount: number };

    if (!telegram_id || !amount) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    const user: any = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: "用户不存在" }), { status: 404 });
    }

    if ((user.points || 0) < amount) {
      return new Response(JSON.stringify({ error: "积分不足" }), { status: 403 });
    }

    const newPoints = user.points - amount;

    await context.env.DB.prepare("UPDATE users SET points = ? WHERE telegram_id = ?")
      .bind(newPoints, telegram_id)
      .run();

    return new Response(JSON.stringify({ success: true, points: newPoints }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
