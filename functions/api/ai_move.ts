
import type { PagesFunction } from '../types';

interface Env {
  AI: any;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { prompt } = await context.request.json() as { prompt: string };

    if (!context.env.AI) {
        return new Response(JSON.stringify({ error: "Cloudflare AI not bound." }), { status: 500 });
    }

    // Use Llama 3 8B Instruct which is usually available on Cloudflare Workers AI
    // We enforce a system prompt to ensure JSON output
    const response = await context.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { 
            role: "system", 
            content: "You are a Grandmaster of Chinese Chess (Xiangqi). You MUST output ONLY a valid JSON object with the structure { \"bestMoveIndex\": number, \"reasoning\": string }. Do NOT output markdown code blocks. Do NOT output any other text." 
        },
        { role: "user", content: prompt }
      ]
    });

    // Llama 3 usually returns { response: "string" }
    // Some models return plain text. We handle strictly.
    const responseText = response.response || JSON.stringify(response);

    return new Response(JSON.stringify({ text: responseText }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
