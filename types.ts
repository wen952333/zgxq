export enum Color {
  RED = 'red',
  BLACK = 'black',
}

export enum PieceType {
  GENERAL = 'general',
  ADVISOR = 'advisor',
  ELEPHANT = 'elephant',
  HORSE = 'horse',
  CHARIOT = 'chariot',
  CANNON = 'cannon',
  SOLDIER = 'soldier',
}

export interface Piece {
  type: PieceType;
  color: Color;
  id: string; // Unique ID for keying
}

export interface Position {
  x: number; // 0-8
  y: number; // 0-9
}

export interface Move {
  from: Position;
  to: Position;
}

export type BoardState = (Piece | null)[][]; // 10 rows, 9 cols

export const COLS = 9;
export const ROWS = 10;

export interface User {
  id: number;
  telegram_id: string;
  username: string;
  points: number;
}
