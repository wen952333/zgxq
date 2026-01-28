
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

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
        if (emptyCount > 0) fen += emptyCount;
        if (y < ROWS - 1) fen += "/";
    }
    return fen + " b - - 0 1";
};

const boardToVisual = (board: BoardState): string => {
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
            console.log(`Gemini Reasoning:`, json.reasoning);
            return allMoves[index].move;
        }
    } catch (e) {
        console.warn(`AI 接口调用失败:`, e);
    }
    return null;
};

export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  const allMoves: { move: Move, notation: string }[] = [];
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          const target = board[to.y][to.x];
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `Index ${allMoves.length}: ${p.type} (${x},${y}) -> (${to.x},${to.y})${target ? ' 吃 '+target.type : ''}`
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  const prompt = `
    Role: You are an Elite Xiangqi Grandmaster. You play BLACK.
    
    Current State (FEN): ${boardToFen(board)}
    
    Visual Representation:
    ${boardToVisual(board)}

    Legal Moves for Black:
    ${allMoves.map(m => m.notation).join('\n')}

    Strategy Guide:
    1. Checkmate Red immediately if possible.
    2. Protect the General at all costs.
    3. Look for tactical opportunities (Fork, Pin, Discovered attack).
    4. Control the center and the river.
    5. Value Chariot(9) > Cannon(4.5) > Horse(4).

    Task:
    Analyze the board and select the absolute best move. 
    Explain your reasoning briefly then provide the index.

    Output JSON:
    {
      "reasoning": "...",
      "bestMoveIndex": <integer>
    }
  `;

  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // 极简启发式兜底
  let best = allMoves[0].move;
  let maxScore = -1;
  const val: any = { chariot: 10, cannon: 5, horse: 5, advisor: 2, elephant: 2, soldier: 1 };
  allMoves.forEach(m => {
    const target = board[m.move.to.y][m.move.to.x];
    const score = target ? val[target.type] : 0;
    if (score > maxScore) {
      maxScore = score;
      best = m.move;
    }
  });
  return best;
};
