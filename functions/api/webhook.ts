interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
}

// Helper to send message back to Telegram
async function sendMessage(token: string, chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const update: any = await context.request.json();

    // Check if it's a message
    if (!update.message || !update.message.text) {
      return new Response("OK");
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const isAdmin = chatId === context.env.ADMIN_CHAT_ID;

    // Only respond to admin commands
    if (!isAdmin) {
      // Optional: Reply saying unauthorized, or just ignore
      return new Response("OK");
    }

    if (text === '/users' || text === '/points') {
      // Fetch top 20 users by points
      const result = await context.env.DB.prepare(
        "SELECT username, telegram_id, points FROM users ORDER BY points DESC LIMIT 20"
      ).all();

      if (!result.results || result.results.length === 0) {
        await sendMessage(context.env.BOT_TOKEN, chatId, "暂无用户数据。");
      } else {
        let msg = "📊 <b>用户积分榜 (Top 20)</b>\n\n";
        result.results.forEach((u: any, index: number) => {
          msg += `${index + 1}. <b>${u.username || 'Unknown'}</b> (ID: ${u.telegram_id})\n   💰 积分: ${u.points}\n\n`;
        });
        await sendMessage(context.env.BOT_TOKEN, chatId, msg);
      }
    } else if (text === '/help' || text === '/start') {
       await sendMessage(context.env.BOT_TOKEN, chatId, "我是管理员Bot。\n\n可用指令:\n/users - 查看用户及积分列表\n/points - 同上");
    }

    return new Response("OK");

  } catch (e: any) {
    console.error(e);
    return new Response("Error", { status: 500 });
  }
}