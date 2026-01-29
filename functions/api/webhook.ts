
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_CHAT_ID: string;
}

async function apiCall(token: string, method: string, body: any) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const update: any = await context.request.json();

    // 1. 处理预结账查询 (CRITICAL: 必须在10秒内回复 OK，否则支付控件会显示“请求超时”或“支付失败”)
    if (update.pre_checkout_query) {
      const queryId = update.pre_checkout_query.id;
      
      // 可以增加逻辑校验 payload 是否合法
      await apiCall(context.env.BOT_TOKEN, "answerPreCheckoutQuery", {
        pre_checkout_query_id: queryId,
        ok: true
      });
      return new Response("OK");
    }

    // 2. 处理支付成功通知
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const payload = payment.invoice_payload; // 'stars_{telegram_id}_{timestamp}'
      const starsAmount = payment.total_amount;
      const pointsToAdd = starsAmount * 500;

      // 解析 Payload 获取 uid
      const parts = payload.split('_');
      const telegramId = parts[1];

      if (telegramId) {
        // 更新数据库
        await context.env.DB.prepare(
          "UPDATE users SET points = points + ? WHERE telegram_id = ?"
        ).bind(pointsToAdd, telegramId).run();

        // 给用户发送确认消息
        const chatId = update.message.chat.id;
        await apiCall(context.env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `💰 <b>充值到账成功！</b>\n\n您已成功支付 ${starsAmount} Stars，${pointsToAdd} 积分已存入您的账户。快去挑战 Gemini AI 吧！`,
          parse_mode: "HTML"
        });

        // 异步通知管理员
        if (context.env.ADMIN_CHAT_ID) {
          await apiCall(context.env.BOT_TOKEN, "sendMessage", {
            chat_id: context.env.ADMIN_CHAT_ID,
            text: `📢 <b>充值成功通知</b>\n用户: ${telegramId}\n金额: ${starsAmount} Stars\n增加积分: ${pointsToAdd}`,
            parse_mode: "HTML"
          });
        }
      }
      return new Response("OK");
    }

    // 3. 基础指令处理 (如 /start)
    if (update.message?.text?.startsWith('/start')) {
      const chatId = update.message.chat.id;
      // 这里的 URL 应该替换为您的真实域名
      const webAppUrl = "https://zgxq-8a0.pages.dev"; 
      
      await apiCall(context.env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: "👋 <b>欢迎回到中国象棋！</b>\n\n点击下方按钮立即开始对弈。挑战最强 Gemini AI，磨练您的棋艺！",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "♟️ 启动棋局", web_app: { url: webAppUrl } }
          ]]
        }
      });
      return new Response("OK");
    }

    return new Response("OK");
  } catch (e: any) {
    console.error("Webhook Internal Error:", e);
    // 即使出错也返回 OK，避免 Telegram 频繁重试导致服务器负载过高
    return new Response("OK"); 
  }
}
