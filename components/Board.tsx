import React, { useCallback } from 'react';
import { BoardState, Position, Move, Color } from '../types.ts';
import { XiangqiPiece } from './XiangqiPiece.tsx';
import { getValidMoves } from '../utils/gameLogic.ts';

interface Props {
  board: BoardState;
  selectedPos: Position | null;
  validMoves: Position[];
  onSelect: (pos: Position) => void;
  onMove: (move: Move) => void;
  turn: Color;
}

export const Board: React.FC<Props> = ({ board, selectedPos, validMoves, onSelect, onMove, turn }) => {
  
  const handleCellClick = (x: number, y: number) => {
    // If clicking a valid move target (empty or enemy)
    const isTarget = validMoves.some(m => m.x === x && m.y === y);
    
    if (selectedPos && isTarget) {
      onMove({ from: selectedPos, to: { x, y } });
      return;
    }

    // Otherwise, select the piece if it belongs to current turn
    const piece = board[y][x];
    if (piece && piece.color === turn) {
      onSelect({ x, y });
    } else {
        // Deselect if clicking empty space not in valid moves
        // We handle this by parent logic usually, but here we can just do nothing or clear selection in parent if we wanted.
    }
  };

  // SVG Drawing Helpers
  const cellWidth = 100 / 9;
  const cellHeight = 100 / 10;
  const halfW = cellWidth / 2;
  const halfH = cellHeight / 2;

  return (
    <div className="relative w-full aspect-[9/10] max-w-[500px] mx-auto wood-texture shadow-2xl rounded-lg border-2 border-[#5c4033] p-1 select-none">
       {/* Grid Lines via SVG */}
       <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 90 100">
          <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#5c4033" strokeWidth="0.5"/>
              </pattern>
          </defs>
          
          {/* Main Grid Frame */}
          <rect x="5" y="5" width="80" height="90" fill="none" stroke="#5c4033" strokeWidth="1" />

          {/* Horizontal Lines */}
          {Array.from({ length: 8 }).map((_, i) => (
             <line key={`h-${i}`} x1="5" y1={15 + i * 10} x2="85" y2={15 + i * 10} stroke="#5c4033" strokeWidth="0.5" />
          ))}

          {/* Vertical Lines (Split by River) */}
          {Array.from({ length: 7 }).map((_, i) => (
             <React.Fragment key={`v-${i}`}>
                <line x1={15 + i * 10} y1="5" x2={15 + i * 10} y2="45" stroke="#5c4033" strokeWidth="0.5" />
                <line x1={15 + i * 10} y1="55" x2={15 + i * 10} y2="95" stroke="#5c4033" strokeWidth="0.5" />
             </React.Fragment>
          ))}

          {/* Palaces (X shapes) */}
          {/* Top Palace */}
          <line x1="35" y1="5" x2="55" y2="25" stroke="#5c4033" strokeWidth="0.5" />
          <line x1="55" y1="5" x2="35" y2="25" stroke="#5c4033" strokeWidth="0.5" />
          {/* Bottom Palace */}
          <line x1="35" y1="75" x2="55" y2="95" stroke="#5c4033" strokeWidth="0.5" />
          <line x1="55" y1="75" x2="35" y2="95" stroke="#5c4033" strokeWidth="0.5" />

          {/* River Text Placeholder (Chu River Han Border) */}
          <text x="25" y="52" fontSize="4" fill="#5c4033" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>楚河</text>
          <text x="65" y="48" fontSize="4" fill="#5c4033" textAnchor="middle" style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', transformOrigin: '65px 50px'}}>漢界</text>
       </svg>

       {/* Pieces Layer */}
       <div className="absolute inset-0 grid grid-rows-10 grid-cols-9 z-10 w-full h-full p-[2%]">
          {board.map((row, y) => (
            row.map((piece, x) => {
              const isValidMoveTarget = validMoves.some(p => p.x === x && p.y === y);
              
              return (
                <div 
                  key={`${x}-${y}`} 
                  className="relative w-full h-full flex items-center justify-center"
                  onClick={() => handleCellClick(x, y)}
                >
                  {/* Marker for valid moves */}
                  {isValidMoveTarget && (
                    <div className={`absolute w-3 h-3 rounded-full z-0 ${piece ? 'bg-red-500 ring-2 ring-white' : 'bg-green-600 opacity-50'}`} />
                  )}
                  
                  {piece && (
                    <XiangqiPiece 
                      piece={piece} 
                      selected={selectedPos?.x === x && selectedPos?.y === y}
                      onClick={() => handleCellClick(x, y)}
                    />
                  )}
                </div>
              );
            })
          ))}
       </div>
    </div>
  );
};