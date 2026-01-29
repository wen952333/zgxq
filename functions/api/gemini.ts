
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

    // 使用 Gemini 3 Pro 预览版以获得顶级推理能力
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
        // 核心配置：将思考预算 (Thinking Budget) 设为 32,000 token (最大值)
        // 这极大地增强了模型在复杂局面下的计算和战术搜索能力，防止“棋力垃圾”的问题
        thinkingConfig: { 
          thinkingBudget: 32000 
        } 
      }
    });

    return new Response(JSON.stringify({ text: response.text }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "AI Service Error" }), { status: 500 });
  }
}
