
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

    // 采用 Gemini 3 Pro 预览版，支持深度推理 (Thinking Process)
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
        // 为模型分配 16k 的思考预算，以便在生成着法前进行多步推演
        thinkingConfig: { 
          thinkingBudget: 16384 
        } 
      }
    });

    return new Response(JSON.stringify({ text: response.text }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "AI 对弈服务繁忙，请稍后再试" }), { status: 500 });
  }
}
