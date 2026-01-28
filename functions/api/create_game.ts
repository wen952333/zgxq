interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { telegram_id, min_level } = await context.request.json() as { telegram_id: string, min_level: number };

    if (!telegram_id) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // Generate a simple unique Game ID (e.g., timestamp + random)
    const game_id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const now = Date.now();

    await context.env.DB.prepare(
      "INSERT INTO games (id, creator_id, min_level, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(game_id, telegram_id, min_level || 0, 'waiting', now).run();

    return new Response(JSON.stringify({ success: true, game_id }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}