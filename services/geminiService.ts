
import { BoardState, Color, Move, ROWS, COLS } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

// We calculate all valid moves for the AI side (Black) client-side
// and send them to the model. The model chooses the best index.

interface ScoredMove {
  index: number;
  reasoning: string;
}

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

// Generic function to call backend AI endpoints
const callBackendAI = async (endpoint: string, prompt: string, allMoves: { move: Move }[]): Promise<Move | null> => {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "API failed");
        }
        
        const data = await res.json();
        let text = data.text || "";
        
        // Cleanup JSON (remove markdown blocks if model hallucinates them)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const json = JSON.parse(text);
        const index = json.bestMoveIndex;

        if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
            console.log(`AI (${endpoint}) Reasoning:`, json.reasoning);
            return allMoves[index].move;
        }
    } catch (e) {
        console.warn(`AI (${endpoint}) call failed:`, e);
    }
    return null;
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

  // 3. Try Gemini (Backend)
  let move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // 4. Fallback: Cloudflare AI (Backend)
  console.log("Falling back to Cloudflare AI...");
  move = await callBackendAI('/api/ai_move', prompt, allMoves);
  if (move) return move;

  // 5. Final Fallback: Random
  console.warn("All AI failed, using random move.");
  return allMoves[Math.floor(Math.random() * allMoves.length)].move;
};
