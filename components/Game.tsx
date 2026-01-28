
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Board } from './Board.tsx';
import { BoardState, Color, Move, PieceType, Position } from '../types.ts';
import { INITIAL_BOARD } from '../constants.ts';
import { getValidMoves } from '../utils/gameLogic.ts';
import { getGeminiMove } from '../services/geminiService.ts';

interface Props {
  mode: 'pve' | 'pvp';
  onBack: () => void;
  invitedGameId?: string | null;
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
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  
  // Prevent double deduction
  const hasDeducted = useRef(false);

  // Initial Logic: Deduct Points or Join Game
  useEffect(() => {
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";

    // 1. PvE: Deduct Entry Fee immediately
    if (mode === 'pve' && !hasDeducted.current) {
        hasDeducted.current = true;
        setIsInitializing(true);
        setStatusMessage("正在进入对局 (扣除30积分)...");

        const deductPoints = async () => {
            try {
                const res = await fetch('/api/deduct_points', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegram_id, amount: 30 })
                });
                const data = await res.json();
                if (data.success) {
                    setStatusMessage(`对局开始 (当前积分: ${data.points})`);
                    setIsInitializing(false);
                } else {
                    alert("无法开始对局: " + (data.error || "积分不足或其他错误"));
                    onBack();
                }
            } catch (e) {
                alert("网络连接失败");
                onBack();
            }
        };
        deductPoints();
    } else if (mode === 'pve' && hasDeducted.current) {
        // Already initialized (e.g. strict mode re-render)
        setIsInitializing(false);
    }

    // 2. PvP: Join Logic
    if (mode === 'pvp' && invitedGameId && !hasDeducted.current) {
         hasDeducted.current = true; 
         setIsInitializing(true);
         setStatusMessage("正在加入房间...");
         
         const joinGame = async () => {
             const username = tgUser?.username || "DevJoiner";

             try {
                // Get user info mainly for level check
                const userRes = await fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`);
                const userData = await userRes.json();
                const userLevel = userData.points ? Math.floor(userData.points / 1000) : 0;

                const joinRes = await fetch('/api/join_game', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ telegram_id, game_id: invitedGameId, user_level: userLevel })
                });
                
                const joinData = await joinRes.json();
                
                if (joinData.success) {
                    setStatusMessage(joinData.message || "对局开始！");
                    setIsInitializing(false);
                } else {
                    alert(joinData.error);
                    onBack();
                }
             } catch (e) {
                 console.error(e);
                 setStatusMessage("连接失败");
                 onBack();
             }
         };
         joinGame();
    }
  }, [mode, invitedGameId, onBack]);

  const playSound = (type: 'move' | 'capture') => {
    // Placeholder
  };

  const handleGameEnd = async (winnerColor: Color) => {
    setWinner(winnerColor);
    
    const result = winnerColor === Color.RED ? 'win' : 'loss';
    
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";

    if (mode === 'pve') {
        try {
            const res = await fetch('/api/game_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id, result })
            });
            const data = await res.json();
            if (data.success) {
                setResultMessage(data.message);
            }
        } catch (e) {
            console.error("Points update failed");
        }
    } else {
        setResultMessage(result === 'win' ? "恭喜胜利!" : "遗憾落败");
    }
  };

  const handleSelect = (pos: Position) => {
    if (winner || isAiThinking || isInitializing) return;
    if (mode === 'pve' && turn !== Color.RED) return;

    const piece = board[pos.y][pos.x];
    
    if (selectedPos && selectedPos.x === pos.x && selectedPos.y === pos.y) {
      setSelectedPos(null);
      setValidMoves([]);
      return;
    }

    if (piece && piece.color === turn) {
        setSelectedPos(pos);
        const moves = getValidMoves(board, pos);
        setValidMoves(moves);
        return;
    }
  };

  const executeMove = useCallback((move: Move) => {
    const newBoard = board.map(row => row.map(p => p));
    const sourcePiece = newBoard[move.from.y][move.from.x];
    const targetPiece = newBoard[move.to.y][move.to.x];

    if (!sourcePiece) return;

    newBoard[move.to.y][move.to.x] = { ...sourcePiece };
    newBoard[move.from.y][move.from.x] = null;

    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);
    
    const pieceName = sourcePiece.type.toUpperCase().slice(0, 2);
    setMoveHistory(prev => [...prev, `${sourcePiece.color === Color.RED ? '🔴' : '⚫'} ${pieceName}: (${move.from.x},${move.from.y})→(${move.to.x},${move.to.y})`]);
    
    playSound(targetPiece ? 'capture' : 'move');

    if (targetPiece && targetPiece.type === PieceType.GENERAL) {
      handleGameEnd(sourcePiece.color);
    } else {
      setTurn(prev => prev === Color.RED ? Color.BLACK : Color.RED);
    }
  }, [board]);

  const handleRematch = () => {
      setBoard(INITIAL_BOARD);
      setTurn(Color.RED);
      setWinner(null);
      setSelectedPos(null);
      setValidMoves([]);
      setMoveHistory([]);
      setResultMessage("");
      setStatusMessage("");
      setIsInitializing(true); 
      hasDeducted.current = false; // Trigger effect again for deduction
  };

  // AI Turn
  useEffect(() => {
    if (mode === 'pve' && turn === Color.BLACK && !winner && !isInitializing) {
      const makeAiMove = async () => {
        setIsAiThinking(true);
        try {
          const move = await getGeminiMove(board);
          if (move) {
            executeMove(move);
          } else {
            console.log("AI No Move");
            handleGameEnd(Color.RED);
          }
        } catch (e) {
          console.error("AI Error", e);
        } finally {
          setIsAiThinking(false);
        }
      };
      makeAiMove();
    }
  }, [turn, winner, board, executeMove, mode, isInitializing]);

  if (isInitializing) {
      return (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] text-[#5c4033] font-sans wood-texture z-50">
             <div className="w-16 h-16 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-xl font-bold animate-pulse">{statusMessage}</p>
          </div>
      );
  }

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
                onClick={handleRematch}
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
