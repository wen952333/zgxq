import { GoogleGenAI, Type } from "@google/genai";
import { BoardState, Color, Move, PieceType, ROWS, COLS, Position } from '../types';
import { getValidMoves } from '../utils/gameLogic';

// We calculate all valid moves for the AI side (Black) client-side
// and send them to the model. The model chooses the best index.
// This prevents hallucinated invalid moves.

interface ScoredMove {
  index: number;
  reasoning: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const boardToString = (board: BoardState): string => {
  let str = "   0 1 2 3 4 5 6 7 8\n";
  for (let y = 0; y < ROWS; y++) {
    str += `${y}  `;
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (!p) str += ". ";
      else {
        const c = p.color === Color.RED ? 'R' : 'B';
        const t = p.type.charAt(0).toUpperCase();
        str += `${c}${t}`;
      }
    }
    str += "\n";
  }
  return str;
};

export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  // 1. Gather all legal moves for BLACK
  const allMoves: { move: Move, notation: string }[] = [];
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `(${x},${y}) to (${to.x},${to.y}) - Piece: ${p.type}`
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  // 2. Construct Prompt
  const boardStr = boardToString(board);
  const movesStr = allMoves.map((m, i) => `${i}: ${m.notation}`).join('\n');
  
  const prompt = `
    You are a Grandmaster of Xiangqi (Chinese Chess). You are playing BLACK.
    
    Current Board State (R=Red, B=Black, .=Empty):
    ${boardStr}

    Valid Moves for BLACK:
    ${movesStr}

    Analyze the board. Identify threats. Choose the absolute best move to win or defend.
    Return the index of the move from the list above.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    const index = json.bestMoveIndex;

    if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
      console.log("Gemini Reasoning:", json.reasoning);
      return allMoves[index].move;
    } else {
        // Fallback: Random legal move if AI fails
        console.warn("AI returned invalid index, falling back to random.");
        return allMoves[Math.floor(Math.random() * allMoves.length)].move;
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    // Fallback logic
    return allMoves[Math.floor(Math.random() * allMoves.length)].move;
  }
};