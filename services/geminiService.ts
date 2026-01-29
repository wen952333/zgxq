
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

// Main function called by Game.tsx
export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  console.time("EngineSearch");
  
  // 1. 使用本地高强度引擎计算最佳步 (Heavyweight Calculation)
  // 这是确保棋力达到“特级大师”或至少“强业余”水平的关键
  const engineMove = searchBestMove(board, Color.BLACK);
  
  console.timeEnd("EngineSearch");

  if (!engineMove) return null; // 困毙/无棋可走

  // 2. (可选) 将引擎的走法发给 Gemini 生成解说
  // 为了响应速度和节省 Token，这里我们直接返回引擎走法。
  // 如果需要 "Reasoning" 显示，可以异步调用 Gemini 解释这步棋。
  
  // 简单的战术日志
  console.log(`[Hybrid Engine] Selected Move: (${engineMove.from.x},${engineMove.from.y}) -> (${engineMove.to.x},${engineMove.to.y})`);

  return engineMove;
};
