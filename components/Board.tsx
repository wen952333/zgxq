
import React from 'react';
import { BoardState, Position, Move, Color } from '../types.ts';
import { XiangqiPiece } from './XiangqiPiece.tsx';

interface Props {
  board: BoardState;
  selectedPos: Position | null;
  validMoves: Position[];
  onSelect: (pos: Position) => void;
  onMove: (move: Move) => void;
  turn: Color;
  riverContent?: React.ReactNode; // 新增：允许传入楚河汉界的内容
}

export const Board: React.FC<Props> = ({ board, selectedPos, validMoves, onSelect, onMove, turn, riverContent }) => {
  
  const handleCellClick = (x: number, y: number) => {
    const isTarget = validMoves.some(m => m.x === x && m.y === y);
    
    if (selectedPos && isTarget) {
      onMove({ from: selectedPos, to: { x, y } });
      return;
    }

    const piece = board[y][x];
    if (piece && piece.color === turn) {
      onSelect({ x, y });
    }
  };

  return (
    <div className="relative w-full aspect-[9/10] max-w-[500px] mx-auto wood-texture shadow-2xl rounded-lg border-2 border-[#5c4033] p-1 select-none">
       {/* Grid Lines via SVG */}
       <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 90 100">
          <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#5c4033" strokeWidth="0.5"/>
              </pattern>
          </defs>
          
          <rect x="5" y="5" width="80" height="90" fill="none" stroke="#5c4033" strokeWidth="1" />

          {/* Horizontal Lines */}
          {Array.from({ length: 8 }).map((_, i) => (
             <line key={`h-${i}`} x1="5" y1={15 + i * 10} x2="85" y2={15 + i * 10} stroke="#5c4033" strokeWidth="0.5" />
          ))}

          {/* Vertical Lines */}
          {Array.from({ length: 7 }).map((_, i) => (
             <React.Fragment key={`v-${i}`}>
                <line x1={15 + i * 10} y1="5" x2={15 + i * 10} y2="45" stroke="#5c4033" strokeWidth="0.5" />
                <line x1={15 + i * 10} y1="55" x2={15 + i * 10} y2="95" stroke="#5c4033" strokeWidth="0.5" />
             </React.Fragment>
          ))}

          {/* Palaces */}
          <line x1="35" y1="5" x2="55" y2="25" stroke="#5c4033" strokeWidth="0.5" />
          <line x1="55" y1="5" x2="35" y2="25" stroke="#5c4033" strokeWidth="0.5" />
          <line x1="35" y1="75" x2="55" y2="95" stroke="#5c4033" strokeWidth="0.5" />
          <line x1="55" y1="75" x2="35" y2="95" stroke="#5c4033" strokeWidth="0.5" />

          {/* River Text - Opacity reduced to make room for HUD */}
          <text x="25" y="52" fontSize="4" fill="#5c4033" opacity="0.3" textAnchor="middle" style={{writingMode: 'vertical-rl'}}>楚河</text>
          <text x="65" y="48" fontSize="4" fill="#5c4033" opacity="0.3" textAnchor="middle" style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', transformOrigin: '65px 50px'}}>漢界</text>
       </svg>

       {/* River HUD Overlay */}
       {riverContent && (
         <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 z-0 pointer-events-none px-2 h-[10%] flex items-center justify-between">
            {riverContent}
         </div>
       )}

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
