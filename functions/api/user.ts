interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const telegram_id = url.searchParams.get("telegram_id");
  const username = url.searchParams.get("username") || "Unknown";

  if (!telegram_id) {
    return new Response(JSON.stringify({ error: "Missing telegram_id" }), { status: 400 });
  }

  try {
    // Try to get user
    let user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();

    if (!user) {
      // Create user if not exists with 300 bonus points
      const now = Date.now();
      await context.env.DB.prepare(
        "INSERT INTO users (telegram_id, username, points, last_signin, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(telegram_id, username, 300, 0, now).run();

      user = await context.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegram_id).first();
    }

    return new Response(JSON.stringify(user), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}