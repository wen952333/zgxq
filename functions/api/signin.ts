
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id } = await context.request.json() as { telegram_id: string };

    if (!telegram_id) {
      return new Response(JSON.stringify({ error: "Missing telegram_id" }), { status: 400 });
    }

    const user: any = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    const lastSignin = new Date(user.last_signin);
    const now = new Date();

    // Check if signed in today (simple check based on date string)
    const isSameDay = lastSignin.toDateString() === now.toDateString();

    if (isSameDay && user.last_signin !== 0) {
      return new Response(JSON.stringify({ success: false, message: "今天已经签到过了", points: user.points }), { status: 200 });
    }

    // Add points (e.g., 100) and update time
    const newPoints = (user.points || 0) + 100;
    const timestamp = now.getTime();

    await context.env.DB.prepare("UPDATE users SET points = ?, last_signin = ? WHERE telegram_id = ?")
      .bind(newPoints, timestamp, telegram_id)
      .run();

    return new Response(JSON.stringify({ success: true, message: "签到成功！获得 100 积分", points: newPoints }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
