
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, stars } = await context.request.json() as { telegram_id: string, stars: number };

    if (!telegram_id || !stars) {
      return new Response(JSON.stringify({ error: "参数不完整" }), { status: 400 });
    }

    if (!context.env.BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "服务器未配置 BOT_TOKEN，请联系管理员" }), { status: 500 });
    }

    // 星星数量必须是正整数
    const amount = Math.abs(Math.floor(stars));
    if (amount <= 0) {
        return new Response(JSON.stringify({ error: "无效的星星数量" }), { status: 400 });
    }

    const points = amount * 500;
    
    // Telegram payload 限制 128 字节
    const shortPayload = `stars_${telegram_id}_${Date.now()}`;

    // 构建 Telegram Stars 支付请求
    const payload = {
      title: "游戏积分充值",
      description: `支付 ${amount} Stars，兑换 ${points} 象棋积分`,
      payload: shortPayload, 
      provider_token: "", // Telegram Stars 必须为空字符串
      currency: "XTR", // 必须是 XTR 
      prices: [{ label: "象棋积分", amount: amount }], 
    };

    const tgResponse = await fetch(`https://api.telegram.org/bot${context.env.BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const tgData: any = await tgResponse.json();

    if (!tgData.ok) {
      console.error("TG API Error:", tgData);
      return new Response(JSON.stringify({ 
        error: "调起支付链接失败", 
        details: tgData.description,
        code: tgData.error_code 
      }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, invoice_link: tgData.result }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
