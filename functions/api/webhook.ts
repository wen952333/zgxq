interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
  TELEGRAM_BOT_APP_URL?: string; // e.g. https://t.me/your_bot/game
}

// Helper to send message back to Telegram
async function sendMessage(token: string, chatId: string | number, text: string, keyboard?: any) {
  const payload: any = { 
    chat_id: chatId, 
    text, 
    parse_mode: "HTML" 
  };
  
  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

    // 1. General Command: /start (Available to everyone)
    if (text === '/start') {
       // The Web App URL (Hosting URL) should be derived or hardcoded if needed.
       // Ideally, use the Mini App Short Name link or the direct URL.
       // For the Inline Keyboard Button, we usually use the Direct HTTPS URL of the hosting.
       const webAppUrl = "https://zgxq-8a0.pages.dev"; 

       await sendMessage(
         context.env.BOT_TOKEN, 
         chatId, 
         "👋 <b>欢迎来到中国象棋!</b>\n\n点击下方按钮开始挑战 Gemini AI 或与好友对战。",
         {
           inline_keyboard: [[
             { text: "♟️ 开始游戏", web_app: { url: webAppUrl } }
           ]]
         }
       );
       return new Response("OK");
    }

    // 2. Admin Logic Guard
    // If not admin and not /start, ignore
    if (!isAdmin) {
      return new Response("OK");
    }

    // 3. Admin Commands
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
    } else if (text === '/help') {
       await sendMessage(context.env.BOT_TOKEN, chatId, "我是管理员Bot。\n\n可用指令:\n/users - 查看用户及积分列表\n/points - 同上");
    }

    return new Response("OK");

  } catch (e: any) {
    console.error(e);
    return new Response("Error", { status: 500 });
  }
}