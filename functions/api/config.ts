
import type { PagesFunction } from '../types';

interface Env {
  TELEGRAM_GROUP_URL?: string;
  TELEGRAM_BOT_APP_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // Define defaults matching the user's bot configuration
  const defaultGroupUrl = "https://t.me/qiyebott_bot";
  const defaultBotAppUrl = "https://t.me/qiyebott_bot/game";

  return new Response(JSON.stringify({
    // Use Environment Variable if set, otherwise fallback to the hardcoded default
    group_url: context.env.TELEGRAM_GROUP_URL || defaultGroupUrl,
    bot_app_url: context.env.TELEGRAM_BOT_APP_URL || defaultBotAppUrl
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
