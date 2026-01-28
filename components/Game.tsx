import React, { useState, useEffect, useCallback } from 'react';
import { Board } from './Board';
import { BoardState, Color, Move, PieceType, Position } from '../types';
import { INITIAL_BOARD } from '../constants';
import { getValidMoves } from '../utils/gameLogic';
import { getGeminiMove } from '../services/geminiService';

interface Props {
  mode: 'pve' | 'pvp';
  onBack: () => void;
  invitedGameId?: string | null; // Optional prop for direct joining
}

export const Game: React.FC<Props> = ({ mode, onBack, invitedGameId }) => {
  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD);
  const [turn, setTurn] = useState<Color>(Color.RED);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [winner, setWinner] = useState<Color | 'Draw' | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Join Logic for PvP
  useEffect(() => {
      const joinGame = async () => {
          if (mode === 'pvp' && invitedGameId) {
             setStatusMessage("正在加入房间...");
             // @ts-ignore
             const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
             const telegram_id = tgUser?.id?.toString() || "dev_user_joiner";
             const username = tgUser?.username || "DevJoiner";

             // 1. Need user data to know level
             try {
                const userRes = await fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`);
                const userData = await userRes.json();
                const userLevel = userData.points ? Math.floor(userData.points / 1000) : 0;

                // 2. Attempt Join
                const joinRes = await fetch('/api/join_game', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ telegram_id, game_id: invitedGameId, user_level: userLevel })
                });
                
                const joinData = await joinRes.json();
                
                if (joinData.success) {
                    setStatusMessage(joinData.message || "对局开始！");
                    // In a real app, here we would start the WebSocket connection
                    // For now, we allow the board to be interactive locally.
                } else {
                    alert(joinData.error);
                    onBack();
                }
             } catch (e) {
                 console.error(e);
                 setStatusMessage("连接失败");
             }
          }
      };
      
      joinGame();
  }, [mode, invitedGameId, onBack]);

  // Sound effects (Optional, placeholder)
  const playSound = (type: 'move' | 'capture') => {
    // const audio = new Audio(type === 'move' ? '/move.mp3' : '/capture.mp3');
    // audio.play().catch(() => {}); 
  };

  const handleGameEnd = async (winnerColor: Color) => {
    setWinner(winnerColor);
    
    // Calculate result for current user (Red)
    // Red wins = win, Black wins = loss
    const result = winnerColor === Color.RED ? 'win' : 'loss';
    
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";

    try {
        const res = await fetch('/api/game_result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id, result })
        });
        const data = await res.json();
        if (data.success) {
            setResultMessage(data.message);
        } else {
            console.error("Points update failed:", data.error);
        }
    } catch (e) {
        console.error("Network error updating points");
    }
  };

  const handleSelect = (pos: Position) => {
    if (winner || isAiThinking) return;
    
    // In PvE, only Red (Human) can select during their turn
    if (mode === 'pve' && turn !== Color.RED) return;

    // In PvP, check if the piece belongs to current turn
    const piece = board[pos.y][pos.x];
    // If selecting a new piece, ensure it's the correct color
    if (!selectedPos && piece && piece.color !== turn) return; 

    // Toggle selection
    if (selectedPos && selectedPos.x === pos.x && selectedPos.y === pos.y) {
      setSelectedPos(null);
      setValidMoves([]);
      return;
    }

    // If switching piece selection (clicking another friendly piece)
    if (piece && piece.color === turn) {
        setSelectedPos(pos);
        const moves = getValidMoves(board, pos);
        setValidMoves(moves);
        return;
    }
  };

  const executeMove = useCallback((move: Move) => {
    const newBoard = board.map(row => row.map(p => p)); // Deep copy structure
    const sourcePiece = newBoard[move.from.y][move.from.x];
    const targetPiece = newBoard[move.to.y][move.to.x];

    if (!sourcePiece) return;

    // Move Piece
    newBoard[move.to.y][move.to.x] = { ...sourcePiece }; // Copy piece
    newBoard[move.from.y][move.from.x] = null;

    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);
    
    // Simple localization for history
    const pieceName = sourcePiece.type === PieceType.GENERAL ? (sourcePiece.color === Color.RED ? '帅' : '将') :
                      sourcePiece.type === PieceType.ADVISOR ? (sourcePiece.color === Color.RED ? '仕' : '士') :
                      sourcePiece.type === PieceType.ELEPHANT ? (sourcePiece.color === Color.RED ? '相' : '象') :
                      sourcePiece.type === PieceType.HORSE ? '马' :
                      sourcePiece.type === PieceType.CHARIOT ? '车' :
                      sourcePiece.type === PieceType.CANNON ? (sourcePiece.color === Color.RED ? '炮' : '砲') :
                      (sourcePiece.color === Color.RED ? '兵' : '卒');

    setMoveHistory(prev => [...prev, `${sourcePiece.color === Color.RED ? '🔴' : '⚫'} ${pieceName}: (${move.from.x},${move.from.y})→(${move.to.x},${move.to.y})`]);
    
    playSound(targetPiece ? 'capture' : 'move');

    // Check Win Condition AFTER move update
    if (targetPiece && targetPiece.type === PieceType.GENERAL) {
      handleGameEnd(sourcePiece.color);
    } else {
      // Switch Turn
      setTurn(prev => prev === Color.RED ? Color.BLACK : Color.RED);
    }
  }, [board]); // Added handleGameEnd dependency concept internally via useCallback structure if needed, but safe here

  const resetGame = () => {
    // Note: Resetting game usually implies a new game, which might need fee deduction again. 
    // For simplicity, we just reset board. In a real app, this might trigger a new "session".
    setBoard(INITIAL_BOARD);
    setTurn(Color.RED);
    setWinner(null);
    setSelectedPos(null);
    setValidMoves([]);
    setMoveHistory([]);
    setResultMessage("");
  };

  // AI Turn Effect
  useEffect(() => {
    if (mode === 'pve' && turn === Color.BLACK && !winner) {
      const makeAiMove = async () => {
        setIsAiThinking(true);
        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 500)); 
        
        try {
          const move = await getGeminiMove(board);
          if (move) {
            executeMove(move);
          } else {
            console.log("No valid moves for AI. Stalemate?");
            // Simple check: if AI has no moves, Red wins (roughly)
            handleGameEnd(Color.RED);
          }
        } catch (e) {
          console.error("AI failed", e);
        } finally {
          setIsAiThinking(false);
        }
      };
      
      makeAiMove();
    }
  }, [turn, winner, board, executeMove, mode]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#f0dbb0] text-[#4a3b2a] font-sans pb-10 wood-texture">
      {/* Header */}
      <header className="w-full p-4 flex justify-between items-center bg-[#5c4033] text-[#f0dbb0] shadow-md z-30">
        <div className="flex items-center space-x-2">
            <button onClick={onBack} className="p-1 hover:bg-[#d4b483] hover:text-[#5c4033] rounded transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
            </button>
            <h1 className="text-xl font-bold tracking-wider">中国象棋</h1>
        </div>
        <button 
          onClick={resetGame}
          className="bg-[#d4b483] text-[#5c4033] px-3 py-1 rounded text-sm font-semibold hover:bg-[#c2a372] transition"
        >
          重新开始
        </button>
      </header>

      {/* Game Status */}
      <div className="w-full max-w-[500px] p-4 flex flex-col items-center z-10">
        {statusMessage && (
            <div className="bg-[#8B0000] text-white px-4 py-1 rounded-full text-xs font-bold mb-2 shadow animate-pulse">
                {statusMessage}
            </div>
        )}

        <div className="w-full flex justify-between items-center">
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-full transition-all ${turn === Color.RED ? 'bg-red-800 text-white shadow-lg scale-105' : 'bg-transparent text-[#5c4033]'}`}>
            <span className="w-3 h-3 rounded-full bg-red-500 border border-white"></span>
            <span className="font-bold text-sm sm:text-base">我方 (红)</span>
            </div>
            
            <div className="font-bold text-lg text-[#5c4033]">VS</div>

            <div className={`flex items-center space-x-2 px-3 py-2 rounded-full transition-all ${turn === Color.BLACK ? 'bg-black text-white shadow-lg scale-105' : 'bg-transparent text-[#5c4033]'}`}>
            <span className="font-bold text-sm sm:text-base">{mode === 'pve' ? 'Gemini (黑)' : '对方 (黑)'}</span>
            {isAiThinking && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            </div>
        </div>
      </div>

      {/* Winner Overlay */}
      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
          <div className="bg-[#f0dbb0] p-8 rounded-xl shadow-2xl border-4 border-[#5c4033] text-center max-w-sm mx-4 animate-bounce-in">
            <h2 className="text-3xl font-bold mb-4 text-[#5c4033]">
              {winner === Color.RED ? "胜利!" : "失败"}
            </h2>
            <p className="mb-2 text-lg font-bold">
              {winner === Color.RED ? "红方获胜！" : (mode === 'pve' ? "Gemini 棋高一着！" : "黑方获胜！")}
            </p>
            <p className={`mb-6 text-sm ${winner === Color.RED ? "text-green-700" : "text-red-700"}`}>
               {resultMessage || "正在结算..."}
            </p>
            <div className="flex flex-col space-y-3">
                <button 
                onClick={resetGame}
                className="w-full bg-[#8B0000] text-white py-3 rounded-lg font-bold text-lg hover:bg-red-900 transition shadow-lg"
                >
                再来一局
                </button>
                <button 
                onClick={onBack}
                className="w-full bg-[#5c4033] text-white py-3 rounded-lg font-bold text-lg hover:bg-[#3e2b22] transition shadow-lg"
                >
                返回大厅
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="w-full px-2 z-10">
        <Board 
          board={board} 
          selectedPos={selectedPos} 
          validMoves={validMoves}
          onSelect={handleSelect}
          onMove={executeMove}
          turn={turn}
        />
      </div>

      {/* Recent Moves Log */}
      <div className="w-full max-w-[500px] mt-6 px-4 z-10">
        <h3 className="text-sm font-bold text-[#5c4033] mb-2 uppercase tracking-wide">棋谱记录</h3>
        <div className="h-24 overflow-y-auto bg-white bg-opacity-60 rounded border border-[#5c4033] p-2 text-sm font-mono scrollbar-hide shadow-inner">
          {moveHistory.length === 0 ? (
            <span className="text-gray-500 italic">对局开始... 红方先行</span>
          ) : (
            moveHistory.slice().reverse().map((move, idx) => (
              <div key={idx} className="mb-1 border-b border-[#d4b483] pb-1 last:border-0">{move}</div>
            ))
          )}
        </div>
      </div>
      
      {/* Footer Instructions */}
      <div className="mt-4 text-xs text-[#5c4033] opacity-80 px-4 text-center z-10">
        点击红棋选择，点击绿色标记点移动
      </div>
    </div>
  );
};