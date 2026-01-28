
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

// Helper: Convert Board to FEN
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
                let char = '';
                switch (p.type) {
                    case PieceType.GENERAL: char = 'k'; break;
                    case PieceType.ADVISOR: char = 'a'; break;
                    case PieceType.ELEPHANT: char = 'b'; break;
                    case PieceType.HORSE: char = 'n'; break;
                    case PieceType.CHARIOT: char = 'r'; break;
                    case PieceType.CANNON: char = 'c'; break;
                    case PieceType.SOLDIER: char = 'p'; break;
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
        // Clean markdown if present (though JSON mode should prevent it)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

        const json = JSON.parse(text);
        const index = json.bestMoveIndex;

        if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
            console.log(`AI Analysis:`, json.reasoning);
            return allMoves[index].move;
        }
    } catch (e) {
        console.warn(`AI (${endpoint}) call failed:`, e);
    }
    return null;
};

export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  const allMoves: { move: Move, notation: string, capture: boolean }[] = [];
  
  // Client-side move generation
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          const target = board[to.y][to.x];
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `(${x},${y}) -> (${to.x},${to.y}) [${p.type}]${target ? ' Capture ' + target.type : ''}`,
            capture: !!target
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  const fen = boardToFen(board);
  const visualBoard = boardToString(board);
  const movesStr = allMoves.map((m, i) => `MoveIndex ${i}: ${m.notation}`).join('\n');
  
  // High-Performance Xiangqi Prompt
  const prompt = `
    Role: You are a Grandmaster Xiangqi Engine playing BLACK. Red is opponent.
    
    Current FEN: ${fen}
    Visual Board: 
    ${visualBoard}

    Candidate Moves for Black:
    ${movesStr}

    Task: Analyze the position deeply and select the ABSOLUTE BEST move from the list above.

    Evaluation Priorities (Highest to Lowest):
    1. **CHECKMATE**: If a move leads to immediate checkmate of Red, PLAY IT.
    2. **SAFETY**: If Black's General is in check or threatened, you MUST save it.
    3. **MATERIAL GAIN**: Look for free captures. 
       - Taking a Chariot (R/r) is huge value (9 pts).
       - Taking a Cannon (C/c) or Horse (N/n) is high value (4.5 pts).
    4. **TRADES**: Do not trade a Chariot for a Soldier. Trade evenly or favorably.
    5. **POSITION**: Control the center, restrict enemy Chariots.

    Negative Constraints:
    - DO NOT make a move that allows Red to immediately capture your Chariot or General for free.
    - DO NOT move pieces aimlessly.
    - DO NOT repeat moves if a better option exists.

    Response Requirement:
    Return a JSON object with:
    - "reasoning": A detailed chain of thought explaining WHY this move wins or saves the game.
    - "bestMoveIndex": The integer index of the chosen move from the provided list.
  `;

  // Use gemini endpoint
  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // Fallback Heuristic
  console.warn("AI failed, using heuristic fallback.");
  
  const valueMap: Record<string, number> = { 'general': 1000, 'chariot': 90, 'cannon': 50, 'horse': 45, 'advisor': 20, 'elephant': 20, 'soldier': 10 };
  
  let bestMove = allMoves[0].move;
  let maxScore = -9999;

  for (const m of allMoves) {
      let score = 0;
      const target = board[m.move.to.y][m.move.to.x];
      
      // Material Gain
      if (target) score += (valueMap[target.type] || 0);

      // Positional: Advance soldiers
      if (board[m.move.from.y][m.move.from.x]?.type === PieceType.SOLDIER) {
          if (m.move.to.y > 4) score += 5; // Crossed river
      }

      // Avoid stupid moves (random noise)
      score += Math.random() * 2;

      if (score > maxScore) {
          maxScore = score;
          bestMove = m.move;
      }
  }

  return bestMove;
};
