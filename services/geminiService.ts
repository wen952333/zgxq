
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
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

        const json = JSON.parse(text);
        const index = json.bestMoveIndex;

        if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
            console.log(`AI Reasoning:`, json.reasoning);
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
  const movesStr = allMoves.map((m, i) => `Index ${i}: ${m.notation}`).join('\n');
  
  // Advanced Prompt for Grandmaster level play
  const prompt = `
    You are a World Class Xiangqi (Chinese Chess) Engine. You are playing BLACK. Red is the opponent.
    
    **Current Board (FEN):** ${fen}
    **Visual:** 
    ${visualBoard}

    **Candidates:**
    ${movesStr}

    **Analysis Task:**
    1. **Identify Threats:** Is Black in Check? Is a key piece (Chariot/Cannon) under attack?
    2. **Find Tactics:** Look for Forks, Pins, Skewers, or Discovered Attacks.
    3. **Material Value:** Chariot(9) > Cannon(4.5) ≈ Horse(4) > Elephant(2) ≈ Advisor(2) > Soldier(1).
    4. **Safety:** Do NOT leave the General exposed to checkmate.
    5. **Selection:** Pick the move that maximizes Black's winning chances.
    
    **CRITICAL:**
    - If you can capture a Chariot for free, DO IT.
    - If you can Checkmate, DO IT.
    - Avoid moves that immediately lose a piece for nothing.

    Output STRICT JSON:
    {
        "reasoning": "Step-by-step tactical analysis...",
        "bestMoveIndex": <integer>
    }
  `;

  // Use gemini endpoint (which should map to gemini-3-pro-preview in backend)
  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // Fallback Heuristic
  console.warn("AI failed, using heuristic fallback.");
  
  // 1. Capture highest value piece
  const valueMap: Record<string, number> = { 'general': 1000, 'chariot': 9, 'cannon': 5, 'horse': 4, 'advisor': 2, 'elephant': 2, 'soldier': 1 };
  
  let bestMove = allMoves[0].move;
  let maxScore = -100;

  for (const m of allMoves) {
      let score = 0;
      const target = board[m.move.to.y][m.move.to.x];
      if (target) score += (valueMap[target.type] || 0) * 10;
      
      // Simple centrality bonus
      if (m.move.to.x >= 3 && m.move.to.x <= 5) score += 1;

      if (score > maxScore) {
          maxScore = score;
          bestMove = m.move;
      }
  }

  return bestMove;
};
