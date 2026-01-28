
import { GoogleGenAI, Type } from "@google/genai";
import type { PagesFunction } from '../types';

interface Env {
  API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { prompt } = await context.request.json() as { prompt: string };
    const apiKey = context.env.API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Gemini API Key not configured." }), { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Enable Thinking Config for deeper reasoning on Chess positions
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bestMoveIndex: { type: Type.INTEGER },
            reasoning: { type: Type.STRING }
          },
          required: ["bestMoveIndex"]
        },
        // CRITICAL: Allocate token budget for internal reasoning (Thinking Process)
        // This makes the model "think" before answering, drastically improving chess moves.
        thinkingConfig: { 
          thinkingBudget: 2048 
        } 
      }
    });

    return new Response(JSON.stringify({ text: response.text }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
