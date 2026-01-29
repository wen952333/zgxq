
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, stars } = await context.request.json() as { telegram_id: string, stars: number };

    // 1. 参数完整性检查
    if (!telegram_id || !stars) {
      return new Response(JSON.stringify({ error: "Missing parameters: telegram_id and stars are required." }), { status: 400 });
    }

    if (!context.env.BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Server Configuration Error: BOT_TOKEN is missing." }), { status: 500 });
    }

    // 2. 支付金额规范化
    const amount = Math.abs(Math.floor(stars));
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid stars amount. Must be a positive integer." }), { status: 400 });
    }

    const points = amount * 500;
    
    // 3. 构造极简 Payload (Telegram 限制 128 字节)
    // 格式: stars_{uid}_{timestamp}
    const payload = `stars_${telegram_id}_${Date.now()}`;

    // 4. 构建 Telegram Stars (XTR) 支付负载
    const invoiceData = {
      title: "象棋大师积分充值",
      description: `支付 ${amount} Stars，立即获取 ${points} 游戏积分`,
      payload: payload,
      provider_token: "", // 必须为空，代表使用 Telegram Stars
      currency: "XTR",    // 必须为 XTR
      prices: [{ label: "游戏积分", amount: amount }], 
      photo_url: "https://zgxq-8a0.pages.dev/piece_red.png", // 可选：增加视觉效果
      is_flexible: false,
    };

    const tgResponse = await fetch(`https://api.telegram.org/bot${context.env.BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoiceData),
    });

    const result: any = await tgResponse.json();

    if (!result.ok) {
      console.error("Telegram API Error:", result);
      return new Response(JSON.stringify({ 
        error: "Failed to generate invoice link", 
        details: result.description 
      }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      invoice_link: result.result 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
