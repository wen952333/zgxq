
import type { D1Database, PagesFunction } from '../types';

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { telegram_id: string, stars: number };
    const { telegram_id, stars } = body;

    if (!telegram_id || !stars) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    if (!context.env.BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Server misconfiguration: BOT_TOKEN missing" }), { status: 500 });
    }

    // Ensure stars is an integer
    const amount = Math.floor(stars);
    // Updated Rate: 1 Star = 500 Points
    const points = amount * 500;
    
    // Call Telegram Bot API to create an invoice link
    // Currency "XTR" is for Telegram Stars
    const payload = {
      title: "购买积分",
      description: `支付 ${amount} 个星星以获取 ${points} 积分`,
      payload: JSON.stringify({ telegram_id, stars: amount, points, timestamp: Date.now() }),
      provider_token: "", // Empty for Telegram Stars
      currency: "XTR",
      prices: [{ label: `${points} 积分`, amount: amount }], // amount is number of stars
    };

    const tgResponse = await fetch(`https://api.telegram.org/bot${context.env.BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const tgData: any = await tgResponse.json();

    if (!tgData.ok) {
      console.error("Telegram API Error:", tgData);
      return new Response(JSON.stringify({ error: "Failed to create invoice", details: tgData.description }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, invoice_link: tgData.result }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
