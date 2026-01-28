import { BoardState, Color, Piece, PieceType, ROWS, COLS } from './types';

// ================= CONFIGURATION =================
// 默认配置 (当后端未配置环境变量时生效)
// 您的机器人: @qiyebott_bot
// 您的 Mini App 短名: game (链接: t.me/qiyebott_bot/game)
export const DEFAULT_TELEGRAM_GROUP_URL = "https://t.me/qiyebott_bot"; 
export const DEFAULT_TELEGRAM_BOT_APP_URL = "https://t.me/qiyebott_bot/game";
// =================================================

// Characters for pieces: [Red, Black]
export const PIECE_CHARS: Record<PieceType, [string, string]> = {
  [PieceType.GENERAL]: ['帥', '將'],
  [PieceType.ADVISOR]: ['仕', '士'],
  [PieceType.ELEPHANT]: ['相', '象'],
  [PieceType.HORSE]: ['馬', '馬'],
  [PieceType.CHARIOT]: ['車', '車'],
  [PieceType.CANNON]: ['炮', '砲'],
  [PieceType.SOLDIER]: ['兵', '卒'],
};

export const INITIAL_BOARD: BoardState = (() => {
  const board: BoardState = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

  const createPiece = (type: PieceType, color: Color, x: number, y: number) => {
    board[y][x] = { type, color, id: `${color}-${type}-${x}-${y}` };
  };

  // Setup Black (Top, y=0 to 4)
  createPiece(PieceType.CHARIOT, Color.BLACK, 0, 0);
  createPiece(PieceType.HORSE, Color.BLACK, 1, 0);
  createPiece(PieceType.ELEPHANT, Color.BLACK, 2, 0);
  createPiece(PieceType.ADVISOR, Color.BLACK, 3, 0);
  createPiece(PieceType.GENERAL, Color.BLACK, 4, 0);
  createPiece(PieceType.ADVISOR, Color.BLACK, 5, 0);
  createPiece(PieceType.ELEPHANT, Color.BLACK, 6, 0);
  createPiece(PieceType.HORSE, Color.BLACK, 7, 0);
  createPiece(PieceType.CHARIOT, Color.BLACK, 8, 0);
  
  createPiece(PieceType.CANNON, Color.BLACK, 1, 2);
  createPiece(PieceType.CANNON, Color.BLACK, 7, 2);
  
  for (let i = 0; i < 5; i++) {
    createPiece(PieceType.SOLDIER, Color.BLACK, i * 2, 3);
  }

  // Setup Red (Bottom, y=5 to 9)
  createPiece(PieceType.CHARIOT, Color.RED, 0, 9);
  createPiece(PieceType.HORSE, Color.RED, 1, 9);
  createPiece(PieceType.ELEPHANT, Color.RED, 2, 9);
  createPiece(PieceType.ADVISOR, Color.RED, 3, 9);
  createPiece(PieceType.GENERAL, Color.RED, 4, 9);
  createPiece(PieceType.ADVISOR, Color.RED, 5, 9);
  createPiece(PieceType.ELEPHANT, Color.RED, 6, 9);
  createPiece(PieceType.HORSE, Color.RED, 7, 9);
  createPiece(PieceType.CHARIOT, Color.RED, 8, 9);
  
  createPiece(PieceType.CANNON, Color.RED, 1, 7);
  createPiece(PieceType.CANNON, Color.RED, 7, 7);
  
  for (let i = 0; i < 5; i++) {
    createPiece(PieceType.SOLDIER, Color.RED, i * 2, 6);
  }

  return board;
})();