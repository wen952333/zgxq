
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

// 增强版棋盘可视化，带坐标轴，帮助 LLM 定位
const boardToVisual = (board: BoardState): string => {
  let str = "    0 1 2 3 4 5 6 7 8 (X-Axis)\n";
  str +=    "   -------------------\n";
  for (let y = 0; y < ROWS; y++) {
    str += `${y} | `;
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (!p) str += ". ";
      else {
        // R=Red (Enemy, Bottom), B=Black (Self, Top)
        const c = p.color === Color.RED ? 'R' : 'B'; 
        // K=King/General, A=Advisor, E=Elephant, H=Horse, R=Rook/Chariot, C=Cannon, P=Pawn
        let t = '';
        switch(p.type) {
            case PieceType.GENERAL: t='K'; break;
            case PieceType.ADVISOR: t='A'; break;
            case PieceType.ELEPHANT: t='E'; break;
            case PieceType.HORSE: t='H'; break;
            case PieceType.CHARIOT: t='R'; break;
            case PieceType.CANNON: t='C'; break;
            case PieceType.SOLDIER: t='P'; break;
        }
        str += `${c}${t}`;
      }
    }
    str += ` | ${y}`;
    str += "\n";
  }
  str +=    "   -------------------\n";
  str += "    0 1 2 3 4 5 6 7 8 (X-Axis)\n";
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
        // 清理 markdown
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
  const allMoves: { move: Move, notation: string, value: number }[] = [];
  
  // 简单的价值估算，帮助 AI 识别吃子价值
  const pieceValues: Record<string, number> = {
      [PieceType.GENERAL]: 1000,
      [PieceType.CHARIOT]: 9,
      [PieceType.CANNON]: 4.5,
      [PieceType.HORSE]: 4,
      [PieceType.ELEPHANT]: 2,
      [PieceType.ADVISOR]: 2,
      [PieceType.SOLDIER]: 1
  };

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          const target = board[to.y][to.x];
          let notation = `${p.type.toUpperCase()} (${x},${y}) -> (${to.x},${to.y})`;
          let val = 0;
          if (target) {
              val = pieceValues[target.type] || 0;
              notation += ` [CAPTURES ${target.type.toUpperCase()} Val=${val}]`;
          }
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `Index ${allMoves.length}: ${notation}`,
            value: val
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  // 强化版 Prompt
  const prompt = `
    Role: You are an Elite Xiangqi (Chinese Chess) Engine playing BLACK.
    Red (Opponent) is at the bottom (Rows 5-9). Black (You) is at the top (Rows 0-4).

    **Current Board (FEN):** ${boardToFen(board)}
    
    **Visual Map:**
    ${boardToVisual(board)}
    (RK=Red King, BK=Black King, RR=Red Rook, BR=Black Rook, etc.)

    **Candidate Moves for Black:**
    ${allMoves.map(m => m.notation).join('\n')}

    **Critical Thinking Process:**
    1. **Safety Check:** Is the Black General (BK) in Check? Can it be killed? If so, you MUST save it.
    2. **Tactical Blunders:** Do NOT move a piece to a square where it will be captured for free, unless it's a sacrifice for Checkmate.
    3. **Attack:** Look for Checkmate opportunities.
    4. **Material:** 
       - Chariot/Rook (Value 9) is the strongest. Don't lose it!
       - Cannon (4.5) & Horse (4) are key attackers.
       - Do not trade a Chariot for a Soldier.
    5. **Evaluation:** Select the move index that maximizes Black's advantage.

    Output STRICT JSON:
    {
      "reasoning": "Step-by-step analysis of threats and best response...",
      "bestMoveIndex": <integer_from_candidate_list>
    }
  `;

  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // 改进的启发式兜底：优先吃高价值子，其次靠近中路
  let best = allMoves[0].move;
  let maxScore = -100;
  
  allMoves.forEach(m => {
    let score = m.value * 10; // 吃子价值权重最高
    // 简单的位置加分：过河卒、中路炮/车
    if (m.move.to.y > 4) score += 1; // 进攻红方半场
    if (m.move.to.x >= 3 && m.move.to.x <= 5) score += 0.5; // 控制中路
    
    if (score > maxScore) {
      maxScore = score;
      best = m.move;
    }
  });
  return best;
};
