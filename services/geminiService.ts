
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

// 棋子价值表 (用于评估和排序)
const PIECE_VALUES: Record<string, number> = {
    [PieceType.GENERAL]: 10000,
    [PieceType.CHARIOT]: 900,
    [PieceType.CANNON]: 450,
    [PieceType.HORSE]: 400,
    [PieceType.ELEPHANT]: 200,
    [PieceType.ADVISOR]: 200,
    [PieceType.SOLDIER]: 100
};

// 辅助函数：计算一方的总兵力
const calculateMaterial = (board: BoardState, color: Color): number => {
    let score = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.color === color) {
                score += PIECE_VALUES[p.type] || 0;
            }
        }
    }
    return score;
};

// 转换 FEN 串
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

// 增强版可视化棋盘 (带坐标和河界)
const boardToVisual = (board: BoardState): string => {
  let str = "     0   1   2   3   4   5   6   7   8   (X)\n";
  str +=    "   +---+---+---+---+---+---+---+---+---+\n";
  for (let y = 0; y < ROWS; y++) {
    str += `${y}  |`;
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (!p) {
         str += " . |"; 
      } else {
        const c = p.color === Color.RED ? 'R' : 'B'; 
        let t = '';
        switch(p.type) {
            case PieceType.GENERAL: t='K'; break; // King
            case PieceType.ADVISOR: t='A'; break;
            case PieceType.ELEPHANT: t='E'; break;
            case PieceType.HORSE: t='H'; break;
            case PieceType.CHARIOT: t='R'; break; // Rook
            case PieceType.CANNON: t='C'; break;
            case PieceType.SOLDIER: t='P'; break; // Pawn
        }
        str += ` ${c}${t}|`;
      }
    }
    str += `  ${y}`;
    if (y === 4) {
        str += "\n   |~~~~~~~~~~~~~ RIVER ~~~~~~~~~~~~~~~|";
    }
    str += "\n";
  }
  str +=    "   +---+---+---+---+---+---+---+---+---+\n";
  str += "     0   1   2   3   4   5   6   7   8   (X)\n";
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
            throw new Error(`API Error: ${res.status}`);
        }
        
        const data = await res.json();
        let text = data.text || "";
        // 清理可能存在的 Markdown 代码块标记
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 尝试提取 JSON
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

        const json = JSON.parse(text);
        const index = json.bestMoveIndex;

        if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
            console.log(`Gemini Thinking:\n${json.reasoning}`);
            return allMoves[index].move;
        } else {
            console.warn("AI returned invalid index:", index);
        }
    } catch (e) {
        console.warn(`AI request failed:`, e);
    }
    return null;
};

export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  const allMoves: { move: Move, notation: string, score: number, desc: string }[] = [];
  
  // 1. 生成所有合法走法
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      // AI 执黑 (Black)
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          const target = board[to.y][to.x];
          
          // 基础评分：吃子加分
          let moveScore = 0;
          let desc = "move";
          
          if (target) {
              const val = PIECE_VALUES[target.type] || 0;
              moveScore += val * 10; // 这里的评分仅用于 Prompt 里的列表排序，帮助 AI 聚焦
              desc = `CAPTURE ${target.color}${target.type} (Val:${val})`;
          }

          // 位置微调：鼓励占中、过河
          if (to.x >= 3 && to.x <= 5) moveScore += 5; // 控制中路
          if (to.y > 4) moveScore += 10; // 过河

          // 生成人类可读的记谱描述 (简化版)
          const pieceName = p.type.toUpperCase();
          const notation = `${pieceName} (${x},${y}) -> (${to.x},${to.y})`;

          allMoves.push({
            move: { from: { x, y }, to },
            notation: notation,
            desc: desc,
            score: moveScore
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  // 2. 预排序：将吃子和高价值的移动排在前面，便于 AI 优先评估
  allMoves.sort((a, b) => b.score - a.score);

  // 3. 计算兵力对比
  const redMaterial = calculateMaterial(board, Color.RED);
  const blackMaterial = calculateMaterial(board, Color.BLACK);
  const materialDiff = blackMaterial - redMaterial;
  
  let situationText = "Equal";
  if (materialDiff > 200) situationText = "Black is Leading (Advantage)";
  if (materialDiff < -200) situationText = "Black is Losing (Disadvantage)";

  // 4. 构建超级详细的 Prompt
  const movesText = allMoves.map((m, i) => 
    `Index ${i}: ${m.notation} [${m.desc}]`
  ).join('\n');

  const prompt = `
    You are XQZero, a Grandmaster level Xiangqi (Chinese Chess) AI Engine.
    
    [GAME CONTEXT]
    You are playing BLACK (Top side, Rows 0-4).
    Opponent is RED (Bottom side, Rows 5-9).
    Current Situation: ${situationText} (Material: Black ${blackMaterial} vs Red ${redMaterial})

    [VISUAL BOARD]
    (RK=Red King, BK=Black King, RR=Red Rook/Chariot, etc.)
    ${boardToVisual(board)}

    [FEN STRING]
    ${boardToFen(board)}

    [CANDIDATE MOVES FOR BLACK]
    (Sorted by approximate heuristic value)
    ${movesText}

    [THINKING PROCESS REQUIREMENTS]
    1. **Safety First**: Is the Black General (BK) currently under attack or exposed? You MUST defend the King.
    2. **Tactical Checks**:
       - Can you Checkmate Red immediately?
       - Can you capture a high-value piece (Rook/Chariot > Cannon/Horse) for free?
       - Are any of your high-value pieces under threat? Move them to safety.
    3. **Strategy**:
       - Control the "River" and the Center lines (columns 3, 4, 5).
       - Do not trade a Chariot (900) for a Soldier (100) or Horse (400) unless it leads to mate.
       - If you are winning, trade pieces to simplify. If losing, complicate the position.

    [OUTPUT FORMAT]
    Return ONLY valid JSON.
    {
      "reasoning": "Briefly explain the tactical evaluation, threats identified, and why the move was chosen.",
      "bestMoveIndex": <The integer index from the Candidate Moves list>
    }
  `;

  // 5. 调用后端 (gemini-3-pro-preview + High Thinking Budget)
  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  
  if (move) return move;

  // 6. 兜底逻辑 (如果 AI 挂了)
  // 贪婪算法：吃最有价值的子，或者随机走一步合法的
  return allMoves[0].move; 
};
