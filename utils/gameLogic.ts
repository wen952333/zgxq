
import { BoardState, Color, PieceType, Position, ROWS, COLS } from '../types.ts';

// ================= 常量定义 =================
export const PIECE_VALUES: Record<string, number> = {
    [PieceType.GENERAL]: 10000,
    [PieceType.CHARIOT]: 900,
    [PieceType.CANNON]: 450,
    [PieceType.HORSE]: 400,
    [PieceType.ELEPHANT]: 200,
    [PieceType.ADVISOR]: 200,
    [PieceType.SOLDIER]: 100
};

export const calculatePlayerLevel = (points: number): number => {
  return Math.floor(Math.max(0, points) / 100);
};

// ================= 基础辅助 =================
const isWithinBounds = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

const isSameColor = (board: BoardState, to: Position, color: Color) => {
  const target = board[to.y][to.x];
  return target && target.color === color;
};

// ================= 核心规则：生成合法走法 =================
export const getValidMoves = (board: BoardState, from: Position): Position[] => {
  const piece = board[from.y][from.x];
  if (!piece) return [];

  const moves: Position[] = [];
  const { type, color } = piece;
  const isRed = color === Color.RED;

  const tryAdd = (x: number, y: number) => {
    if (isWithinBounds(x, y) && !isSameColor(board, { x, y }, color)) {
      moves.push({ x, y });
    }
  };

  switch (type) {
    case PieceType.GENERAL: {
      // 九宫格内移动
      const deltas = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const yMin = isRed ? 7 : 0;
      const yMax = isRed ? 9 : 2;
      const xMin = 3;
      const xMax = 5;

      deltas.forEach(([dx, dy]) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        if (nx >= xMin && nx <= xMax && ny >= yMin && ny <= yMax) {
          tryAdd(nx, ny);
        }
      });
      
      // 飞将规则 (老将照面)
      const stepY = isRed ? -1 : 1;
      let checkY = from.y + stepY;
      while (checkY >= 0 && checkY < ROWS) {
          const p = board[checkY][from.x];
          if (p) {
              if (p.type === PieceType.GENERAL && p.color !== color) {
                  moves.push({ x: from.x, y: checkY });
              }
              break;
          }
          checkY += stepY;
      }
      break;
    }

    case PieceType.ADVISOR: {
      // 士：九宫格斜走
      const deltas = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const yMin = isRed ? 7 : 0;
      const yMax = isRed ? 9 : 2;
      const xMin = 3;
      const xMax = 5;

      deltas.forEach(([dx, dy]) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        if (nx >= xMin && nx <= xMax && ny >= yMin && ny <= yMax) {
          tryAdd(nx, ny);
        }
      });
      break;
    }

    case PieceType.ELEPHANT: {
      // 象：田字，由于塞象眼 (Eye Blocking) 规则
      const deltas = [
          { dx: 2, dy: 2, eyeX: 1, eyeY: 1 },
          { dx: 2, dy: -2, eyeX: 1, eyeY: -1 },
          { dx: -2, dy: 2, eyeX: -1, eyeY: 1 },
          { dx: -2, dy: -2, eyeX: -1, eyeY: -1 }
      ];
      const yMin = isRed ? 5 : 0;
      const yMax = isRed ? 9 : 4; // 不能过河

      deltas.forEach(({ dx, dy, eyeX, eyeY }) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        const blockX = from.x + eyeX;
        const blockY = from.y + eyeY;

        if (ny >= yMin && ny <= yMax && isWithinBounds(nx, ny)) {
            // 检查象眼是否有子
            if (isWithinBounds(blockX, blockY) && !board[blockY][blockX]) {
                tryAdd(nx, ny);
            }
        }
      });
      break;
    }

    case PieceType.HORSE: {
      // 马：日字，蹩马腿 (Hobbling Leg) 规则
      const movesData = [
        { dx: 1, dy: 2, lx: 0, ly: 1 },
        { dx: -1, dy: 2, lx: 0, ly: 1 },
        { dx: 1, dy: -2, lx: 0, ly: -1 },
        { dx: -1, dy: -2, lx: 0, ly: -1 },
        { dx: 2, dy: 1, lx: 1, ly: 0 },
        { dx: 2, dy: -1, lx: 1, ly: 0 },
        { dx: -2, dy: 1, lx: -1, ly: 0 },
        { dx: -2, dy: -1, lx: -1, ly: 0 },
      ];

      movesData.forEach(({ dx, dy, lx, ly }) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        const legX = from.x + lx;
        const legY = from.y + ly;

        if (isWithinBounds(nx, ny)) {
            // 检查马腿
            if (isWithinBounds(legX, legY) && !board[legY][legX]) {
                tryAdd(nx, ny);
            }
        }
      });
      break;
    }

    case PieceType.CHARIOT: {
      // 车：直行无阻
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dx, dy]) => {
        let nx = from.x + dx;
        let ny = from.y + dy;
        while (isWithinBounds(nx, ny)) {
          const target = board[ny][nx];
          if (!target) {
            tryAdd(nx, ny);
          } else {
            if (target.color !== color) {
              tryAdd(nx, ny); // 吃子
            }
            break; // 撞到子停下
          }
          nx += dx;
          ny += dy;
        }
      });
      break;
    }

    case PieceType.CANNON: {
      // 炮：隔山打牛
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dx, dy]) => {
        let nx = from.x + dx;
        let ny = from.y + dy;
        let screenFound = false;

        while (isWithinBounds(nx, ny)) {
          const target = board[ny][nx];
          if (!screenFound) {
            if (!target) {
              tryAdd(nx, ny); // 移动
            } else {
              screenFound = true; // 找到炮架
            }
          } else {
            // 找到炮架后，寻找第一个目标
            if (target) {
              if (target.color !== color) {
                tryAdd(nx, ny); // 吃子
              }
              break; // 无论是否吃到，后面都不能走了
            }
          }
          nx += dx;
          ny += dy;
        }
      });
      break;
    }

    case PieceType.SOLDIER: {
      // 兵/卒
      const forward = isRed ? -1 : 1;
      const crossedRiver = isRed ? from.y <= 4 : from.y >= 5;

      tryAdd(from.x, from.y + forward); // 前进

      if (crossedRiver) {
        tryAdd(from.x - 1, from.y);
        tryAdd(from.x + 1, from.y);
      }
      break;
    }
  }

  return moves;
};

// ================= 规则判断 =================

// 判断是否"困毙" (无路可走 = 输)
// 注意：这需要在轮到某方走棋时调用。如果 hasLegalMoves 返回 false，则该方输。
export const hasLegalMoves = (board: BoardState, color: Color): boolean => {
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.color === color) {
                const moves = getValidMoves(board, { x, y });
                for (const move of moves) {
                    if (!willBeChecked(board, { from: {x, y}, to: move }, color)) {
                        return true; // 只要有一步合法且不送将，就没死
                    }
                }
            }
        }
    }
    return false;
};

// 模拟一步棋，检查是否导致自己被将军 (送将)
export const willBeChecked = (board: BoardState, move: {from: Position, to: Position}, myColor: Color): boolean => {
    // 1. 模拟移动
    const fromP = board[move.from.y][move.from.x];
    const toP = board[move.to.y][move.to.x];
    
    // 临时修改棋盘
    board[move.to.y][move.to.x] = fromP;
    board[move.from.y][move.from.x] = null;

    // 2. 检查我的老将是否被攻击
    const isChecked = isKingInDanger(board, myColor);

    // 3. 恢复棋盘
    board[move.from.y][move.from.x] = fromP;
    board[move.to.y][move.to.x] = toP;

    return isChecked;
};

// 检查老将是否在危险中
export const isKingInDanger = (board: BoardState, color: Color): boolean => {
    // 1. 找老将
    let kx = -1, ky = -1;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.type === PieceType.GENERAL && p.color === color) {
                kx = x; ky = y; break;
            }
        }
        if (kx !== -1) break;
    }
    if (kx === -1) return true; // 老将没了，肯定输了

    // 2. 遍历对方所有棋子，看能否吃到老将
    const enemyColor = color === Color.RED ? Color.BLACK : Color.RED;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.color === enemyColor) {
                // 使用 getValidMoves 获取攻击范围
                const moves = getValidMoves(board, { x, y });
                if (moves.some(m => m.x === kx && m.y === ky)) {
                    return true;
                }
            }
        }
    }
    return false;
};

// 计算总兵力
export const evaluateMaterial = (board: BoardState, color: Color): number => {
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

// 生成 FEN 串 (用于检测重复局面)
export const boardToFen = (board: BoardState, turn: Color): string => {
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
    const turnChar = turn === Color.RED ? 'w' : 'b'; 
    return `${fen} ${turnChar}`;
};
