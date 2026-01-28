import React from 'react';
import { Color, Piece, PieceType } from '../types.ts';
import { PIECE_CHARS } from '../constants.ts';

interface Props {
  piece: Piece;
  selected: boolean;
  onClick: () => void;
}

export const XiangqiPiece: React.FC<Props> = ({ piece, selected, onClick }) => {
  const isRed = piece.color === Color.RED;
  const chars = PIECE_CHARS[piece.type];
  const char = isRed ? chars[0] : chars[1];

  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`
        absolute z-10 
        w-[90%] h-[90%] 
        top-[5%] left-[5%]
        rounded-full 
        flex items-center justify-center 
        shadow-[2px_2px_4px_rgba(0,0,0,0.4)]
        cursor-pointer
        transition-transform duration-200
        ${selected ? 'scale-110 ring-4 ring-yellow-400 z-20' : 'hover:scale-105'}
        ${isRed ? 'bg-[#f5e6d3] border-4 border-[#8B0000]' : 'bg-[#f5e6d3] border-4 border-[#1a1a1a]'}
      `}
    >
      {/* Inner ring for realism */}
      <div className={`
        w-[85%] h-[85%] rounded-full border border-dashed border-opacity-30
        ${isRed ? 'border-red-800' : 'border-black'}
        flex items-center justify-center
      `}>
        <span className={`
          text-2xl sm:text-3xl font-bold font-serif select-none
          ${isRed ? 'text-[#8B0000]' : 'text-[#1a1a1a]'}
        `}>
          {char}
        </span>
      </div>
    </div>
  );
};