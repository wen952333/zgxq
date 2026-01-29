
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { searchBestMove } from '../utils/engine.ts';

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
        if (emptyCount > 0) fen += emptyCount;
        if (y < ROWS - 1) fen += "/";
    }
    return fen + " b - - 0 1"; 
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

// Main function called by Game.tsx
export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  console.time("EngineSearch");
  
  // 1. 使用本地高强度引擎 (集成开局库 + IDDFS) 计算最佳步
  const engineMove = searchBestMove(board, Color.BLACK);
  
  console.timeEnd("EngineSearch");

  if (!engineMove) return null;

  // 2. 模拟大师思维日志 (如果将来接 Gemini API，可以把这个 prompt 发过去)
  // 这里我们为了速度，直接返回引擎计算结果，但在 Prompt 设计上，我们已经为"军师"模式准备好了逻辑
  /*
  const masterPrompt = `
    Role: You are Grandmaster Hu Ronghua.
    Task: Analyze the current Xiangqi position and explain the chosen move.
    
    Principles to Apply:
    1. "Ning Shi Yi Zi, Bu Shi Xian Shou" (Better to lose a piece than lose the initiative).
    2. Control the center (Central Cannon).
    3. Mobility of Chariots is paramount.
    
    Move: (${engineMove.from.x},${engineMove.from.y}) -> (${engineMove.to.x},${engineMove.to.y})
    
    Explain why this is the best move using professional Xiangqi terminology.
  `;
  */
  
  console.log(`[Master Engine] Selected Move: (${engineMove.from.x},${engineMove.from.y}) -> (${engineMove.to.x},${engineMove.to.y})`);

  return engineMove;
};
