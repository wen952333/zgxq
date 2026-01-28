
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

interface ScoredMove {
  index: number;
  reasoning: string;
}

// Helper: Convert Board to FEN (Forsyth-Edwards Notation for Xiangqi)
// This standard helps LLMs understand the board much better than a grid.
const boardToFen = (board: BoardState): string => {
    let fen = "";
    for (let y = 0; y < ROWS; y++) {
        let emptyCount = 0;
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (!p) {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                // Red = Uppercase, Black = Lowercase
                let char = '';
                switch (p.type) {
                    case PieceType.GENERAL: char = 'k'; break; // King/General
                    case PieceType.ADVISOR: char = 'a'; break;
                    case PieceType.ELEPHANT: char = 'b'; break; // Bishop/Elephant
                    case PieceType.HORSE: char = 'n'; break; // Knight/Horse
                    case PieceType.CHARIOT: char = 'r'; break; // Rook/Chariot
                    case PieceType.CANNON: char = 'c'; break;
                    case PieceType.SOLDIER: char = 'p'; break; // Pawn/Soldier
                }
                if (p.color === Color.RED) char = char.toUpperCase();
                fen += char;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (y < ROWS - 1) fen += "/";
    }
    // Add active color (b for black/AI)
    fen += " b - - 0 1"; 
    return fen;
};

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
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Sometimes LLMs return extra text, try to find the JSON object
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

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
  const allMoves: { move: Move, notation: string }[] = [];
  
  // Client-side move generation to ensure validity
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `(${x},${y}) -> (${to.x},${to.y}) [${p.type}]`
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  // Enhanced Prompt
  const fen = boardToFen(board);
  const visualBoard = boardToString(board);
  const movesStr = allMoves.map((m, i) => `Move ${i}: ${m.notation}`).join('\n');
  
  const prompt = `
    You are a Grandmaster of Xiangqi (Chinese Chess). You are playing BLACK.
    The opponent is RED.

    **Current Board (FEN):**
    ${fen}
    
    **Visual Reference:**
    ${visualBoard}

    **Strategic Guidelines:**
    1. **Safety:** Do not leave your General (King) or Chariot exposed to immediate capture unless it's a calculated sacrifice.
    2. **Control:** Control the river and center lines.
    3. **Development:** Develop Chariots and Cannons early.
    4. **Aggression:** If you can capture a high-value piece (Chariot > Cannon/Horse > Advisor/Elephant) without losing more, do it.

    **Available Moves for BLACK:**
    ${movesStr}

    **Task:**
    Analyze the position. Select the best move from the list above.
    Calculate the outcome of the selected move.
    
    Response Format (JSON only):
    {
        "reasoning": "Brief chain of thought explanation.",
        "bestMoveIndex": <integer_index_from_list>
    }
  `;

  // Try Backend Gemini first
  let move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // Fallback to Cloudflare AI
  console.log("Falling back to Cloudflare AI...");
  move = await callBackendAI('/api/ai_move', prompt, allMoves);
  if (move) return move;

  // Final Fallback: Capture if possible, else random
  console.warn("All AI failed, using fallback heuristic.");
  
  // Simple capture heuristic
  const captureMove = allMoves.find(m => {
      const target = board[m.move.to.y][m.move.to.x];
      return target && target.color === Color.RED;
  });
  if (captureMove) return captureMove.move;

  return allMoves[Math.floor(Math.random() * allMoves.length)].move;
};
