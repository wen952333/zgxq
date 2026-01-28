import { BoardState, Color, PieceType, Position, ROWS, COLS } from '../types';

const isWithinBounds = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

const isSameColor = (board: BoardState, to: Position, color: Color) => {
  const target = board[to.y][to.x];
  return target && target.color === color;
};

// Simplified logic for "eye blocking" and specific movement constraints
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
      // Moves 1 step orthogonal, confined to palace
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
      
      // Flying General Rule: Can attack enemy general if facing with no pieces in between
      // (Simplified implementation for this demo: check vertical line)
      let facingY = isRed ? from.y - 1 : from.y + 1;
      const stepY = isRed ? -1 : 1;
      while (facingY >= 0 && facingY < ROWS) {
        const p = board[facingY][from.x];
        if (p) {
          if (p.type === PieceType.GENERAL && p.color !== color) {
            moves.push({ x: from.x, y: facingY });
          }
          break; 
        }
        facingY += stepY;
      }
      break;
    }

    case PieceType.ADVISOR: {
      // Diagonal 1 step, confined to palace
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
      // Diagonal 2 steps, cannot cross river, cannot jump over pieces (eye)
      const deltas = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
      const yMin = isRed ? 5 : 0;
      const yMax = isRed ? 9 : 4; // Cannot cross river

      deltas.forEach(([dx, dy]) => {
        const nx = from.x + dx;
        const ny = from.y + dy;
        // Check "eye"
        const eyeX = from.x + dx / 2;
        const eyeY = from.y + dy / 2;
        
        if (ny >= yMin && ny <= yMax && isWithinBounds(nx, ny)) {
            if (!board[eyeY][eyeX]) { // If eye is not blocked
                tryAdd(nx, ny);
            }
        }
      });
      break;
    }

    case PieceType.HORSE: {
      // L shape (1 ortho + 1 diag), blocked by "hobbling leg"
      const movesData = [
        { dest: [1, 2], leg: [0, 1] },
        { dest: [-1, 2], leg: [0, 1] },
        { dest: [1, -2], leg: [0, -1] },
        { dest: [-1, -2], leg: [0, -1] },
        { dest: [2, 1], leg: [1, 0] },
        { dest: [2, -1], leg: [1, 0] },
        { dest: [-2, 1], leg: [-1, 0] },
        { dest: [-2, -1], leg: [-1, 0] },
      ];

      movesData.forEach(({ dest, leg }) => {
        const nx = from.x + dest[0];
        const ny = from.y + dest[1];
        const legX = from.x + leg[0];
        const legY = from.y + leg[1];

        if (isWithinBounds(legX, legY) && !board[legY][legX]) { // Leg check
             tryAdd(nx, ny);
        }
      });
      break;
    }

    case PieceType.CHARIOT: {
      // Orthogonal until blocked
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dx, dy]) => {
        let nx = from.x + dx;
        let ny = from.y + dy;
        while (isWithinBounds(nx, ny)) {
          if (!board[ny][nx]) {
            tryAdd(nx, ny);
          } else {
            if (board[ny][nx]?.color !== color) {
              tryAdd(nx, ny); // Capture
            }
            break;
          }
          nx += dx;
          ny += dy;
        }
      });
      break;
    }

    case PieceType.CANNON: {
      // Orthogonal move like chariot, but capture requires jumping 1 piece (screen)
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dx, dy]) => {
        let nx = from.x + dx;
        let ny = from.y + dy;
        let screenFound = false;

        while (isWithinBounds(nx, ny)) {
          const target = board[ny][nx];
          if (!screenFound) {
            if (!target) {
              tryAdd(nx, ny); // Move
            } else {
              screenFound = true; // Found the screen
            }
          } else {
            // After screen found, can only capture
            if (target) {
              if (target.color !== color) {
                tryAdd(nx, ny); // Capture
              }
              break; // Cannot jump more than one
            }
          }
          nx += dx;
          ny += dy;
        }
      });
      break;
    }

    case PieceType.SOLDIER: {
      // Forward 1. If crossed river, also Side 1. No backward.
      const forward = isRed ? -1 : 1;
      const crossedRiver = isRed ? from.y <= 4 : from.y >= 5;

      tryAdd(from.x, from.y + forward); // Always forward

      if (crossedRiver) {
        tryAdd(from.x - 1, from.y);
        tryAdd(from.x + 1, from.y);
      }
      break;
    }
  }

  return moves;
};