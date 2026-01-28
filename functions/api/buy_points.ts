interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, stars } = await context.request.json() as { telegram_id: string, stars: number };

    if (!telegram_id || !stars) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // Updated Rate: 1 Star = 500 Points
    const pointsToAdd = stars * 500;

    const user: any = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    const newPoints = (user.points || 0) + pointsToAdd;

    await context.env.DB.prepare("UPDATE users SET points = ? WHERE telegram_id = ?")
      .bind(newPoints, telegram_id)
      .run();

    // Notify Admin if configured
    if (context.env.BOT_TOKEN && context.env.ADMIN_CHAT_ID) {
        const adminMsg = `💰 <b>新充值提醒</b>\n\n用户: ${user.username} (ID: ${telegram_id})\n支付: ${stars} ⭐\n获得: ${pointsToAdd} 积分\n当前总积分: ${newPoints}`;
        
        // Fire and forget notification to avoid blocking the response
        context.waitUntil(
            fetch(`https://api.telegram.org/bot${context.env.BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: context.env.ADMIN_CHAT_ID,
                    text: adminMsg,
                    parse_mode: "HTML"
                })
            })
        );
    }

    return new Response(JSON.stringify({ success: true, points: newPoints, message: `成功充值！消耗 ${stars} 星，获得 ${pointsToAdd} 积分` }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}