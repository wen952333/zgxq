
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, game_id, user_level } = await context.request.json() as { telegram_id: string, game_id: string, user_level: number };

    if (!telegram_id || !game_id) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // Get Game Info
    const game: any = await context.env.DB.prepare("SELECT * FROM games WHERE id = ?").bind(game_id).first();

    if (!game) {
      return new Response(JSON.stringify({ error: "对局不存在或已失效" }), { status: 404 });
    }

    if (game.status !== 'waiting') {
       // Ideally re-connect logic here, but for now just error
       if (game.creator_id === telegram_id || game.opponent_id === telegram_id) {
           return new Response(JSON.stringify({ success: true, message: "重连成功" }), { status: 200 });
       }
       return new Response(JSON.stringify({ error: "对局已开始或已结束" }), { status: 403 });
    }

    if (game.creator_id === telegram_id) {
        return new Response(JSON.stringify({ success: true, message: "等待对手中..." }), { status: 200 });
    }

    // Check Level Restriction
    if (user_level < game.min_level) {
        return new Response(JSON.stringify({ error: `您的等级不足 (Lv.${user_level})，对方限制为 Lv.${game.min_level}+` }), { status: 403 });
    }

    // Update Game to Active
    await context.env.DB.prepare("UPDATE games SET opponent_id = ?, status = 'active' WHERE id = ?")
      .bind(telegram_id, game_id)
      .run();

    return new Response(JSON.stringify({ success: true, message: "加入成功！" }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
