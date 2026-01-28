
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

const TURN_TIME_LIMIT = 120; // 120 Seconds per turn

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
  
  // Game Logic State
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [historyStack, setHistoryStack] = useState<BoardState[]>([]); // For Undo
  const [noCaptureSteps, setNoCaptureSteps] = useState(0); // 60 moves rule

  const hasDeducted = useRef(false);

  // Timer Effect
  useEffect(() => {
    if (winner || isInitializing || (mode === 'pve' && turn === Color.BLACK && isAiThinking)) return; // Pause timer when AI thinks (it takes time)

    const timer = setInterval(() => {
        setTimeLeft((prev) => {
            if (prev <= 1) {
                clearInterval(timer);
                handleGameEnd(turn === Color.RED ? Color.BLACK : Color.RED, "超时判负");
                return 0;
            }
            return prev - 1;
        });
    }, 1000);

    return () => clearInterval(timer);
  }, [turn, winner, isInitializing, mode, isAiThinking]);

  // Initial Logic: Deduct Points or Join Game
  useEffect(() => {
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";

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
                
                // If API fails (e.g. 404/500), we act as if it's offline mode/guest mode
                // We do NOT block the game start
                const data = res.ok ? await res.json() : { success: false, error: "Network Error" };
                
                if (data.success) {
                    setStatusMessage(`对局开始 (当前积分: ${data.points})`);
                } else {
                    console.warn("Deduction failed, proceeding anyway (Guest/Offline mode)");
                    setStatusMessage("对局开始 (离线模式/免扣分)");
                }
                
                setIsInitializing(false);
                setHistoryStack([INITIAL_BOARD.map(row => row.map(p => p ? {...p} : null))]);

            } catch (e) {
                console.warn("Network failed, proceeding offline");
                setStatusMessage("对局开始 (离线模式)");
                setIsInitializing(false);
                setHistoryStack([INITIAL_BOARD.map(row => row.map(p => p ? {...p} : null))]);
            }
        };
        deductPoints();
    } else if (mode === 'pve' && hasDeducted.current) {
        setIsInitializing(false);
    }

    if (mode === 'pvp' && invitedGameId && !hasDeducted.current) {
         hasDeducted.current = true; 
         setIsInitializing(true);
         setStatusMessage("正在加入房间...");
         
         const joinGame = async () => {
             const username = tgUser?.username || "DevJoiner";
             try {
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
    // Placeholder for sound
  };

  const handleGameEnd = async (winnerColor: Color | 'Draw', reason: string = "") => {
    setWinner(winnerColor);
    setResultMessage(reason);
    
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";
    
    let result = 'loss';
    if (winnerColor === Color.RED) result = 'win';
    if (winnerColor === 'Draw') result = 'draw';

    if (mode === 'pve') {
        try {
            const res = await fetch('/api/game_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id, result })
            });
            const data = await res.json();
            if (data.success) {
                setResultMessage(`${reason} ${data.message}`);
            }
        } catch (e) {
            console.error("Points update failed, offline mode");
        }
    } else {
        setResultMessage(reason);
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
    setHistoryStack(prev => {
        const newHistory = [...prev, board.map(row => row.map(p => p ? {...p} : null))];
        if (newHistory.length > 20) newHistory.shift();
        return newHistory;
    });

    const newBoard = board.map(row => row.map(p => p));
    const sourcePiece = newBoard[move.from.y][move.from.x];
    const targetPiece = newBoard[move.to.y][move.to.x];

    if (!sourcePiece) return;

    newBoard[move.to.y][move.to.x] = { ...sourcePiece };
    newBoard[move.from.y][move.from.x] = null;

    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);
    setTimeLeft(TURN_TIME_LIMIT); 
    
    if (targetPiece) {
        setNoCaptureSteps(0);
    } else {
        setNoCaptureSteps(prev => prev + 1);
    }

    const pieceName = sourcePiece.type.toUpperCase().slice(0, 2);
    setMoveHistory(prev => [...prev, `${sourcePiece.color === Color.RED ? '🔴' : '⚫'} ${pieceName}: (${move.from.x},${move.from.y})→(${move.to.x},${move.to.y})`]);
    playSound(targetPiece ? 'capture' : 'move');

    if (targetPiece && targetPiece.type === PieceType.GENERAL) {
      handleGameEnd(sourcePiece.color, "将死！");
    } else if (noCaptureSteps >= 120) {
      handleGameEnd('Draw', "60回合无吃子，自动和棋");
    } else {
      setTurn(prev => prev === Color.RED ? Color.BLACK : Color.RED);
    }
  }, [board, noCaptureSteps]);

  const handleUndo = () => {
    if (mode !== 'pve' || turn !== Color.RED || winner) return;
    if (historyStack.length < 2) {
        alert("无法悔棋 (开局或记录不足)");
        return;
    }
    const prevBoard = historyStack[historyStack.length - 2];
    setBoard(prevBoard);
    setHistoryStack(prev => prev.slice(0, prev.length - 2));
    setMoveHistory(prev => prev.slice(0, prev.length - 2));
    setTurn(Color.RED);
    setWinner(null);
    setNoCaptureSteps(prev => Math.max(0, prev - 2));
    setTimeLeft(TURN_TIME_LIMIT);
  };

  const handleSurrender = () => {
      if (winner) return;
      if (confirm("确定要投降认输吗？将扣除积分。")) {
          handleGameEnd(turn === Color.RED ? Color.BLACK : Color.RED, "投降认输");
      }
  };

  const handleDraw = () => {
      if (winner) return;
      if (mode === 'pve') {
          if (noCaptureSteps > 60) {
              handleGameEnd('Draw', "局势僵持，同意和棋");
          } else {
              alert("Gemini: 只有在 30 回合(60步)无吃子后才能申请和棋。");
          }
      } else {
          alert("对方拒绝了您的求和请求。");
      }
  };

  // AI Turn
  useEffect(() => {
    if (mode === 'pve' && turn === Color.BLACK && !winner && !isInitializing) {
      const makeAiMove = async () => {
        setIsAiThinking(true);
        // Short delay for UI update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          const move = await getGeminiMove(board);
          if (move) {
            executeMove(move);
          } else {
            console.log("AI Resigns");
            handleGameEnd(Color.RED, "AI 认输 (无路可走)");
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
      <header className="w-full p-3 flex justify-between items-center bg-[#5c4033] text-[#f0dbb0] shadow-md z-30">
        <button onClick={onBack} className="flex items-center space-x-1 hover:text-[#d4b483]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span className="font-bold text-sm">退出</span>
        </button>
        <div className="flex flex-col items-center">
             <h1 className="text-lg font-bold tracking-wider">中国象棋</h1>
             <span className="text-[10px] opacity-80">Gemini 3 Pro AI (Lv.9)</span>
        </div>
        <div className="w-10"></div>
      </header>

      {/* Game Status & Timer */}
      <div className="w-full max-w-[500px] p-4 flex flex-col items-center z-10">
        {statusMessage && (
            <div className="bg-[#8B0000] text-white px-4 py-1 rounded-full text-xs font-bold mb-2 shadow animate-pulse">
                {statusMessage}
            </div>
        )}

        <div className="w-full flex justify-between items-center bg-[#ebd4a9] p-2 rounded-lg border border-[#d4b483] shadow-inner">
            {/* Player (Red) */}
            <div className={`flex flex-col items-center transition-all ${turn === Color.RED ? 'scale-105' : 'opacity-70'}`}>
                <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full border border-red-300">
                    <span className="w-3 h-3 rounded-full bg-red-600 border border-white shadow-sm"></span>
                    <span className="font-bold text-[#8B0000] text-sm">我方</span>
                </div>
                {turn === Color.RED && !winner && (
                    <span className={`text-xs font-mono font-bold mt-1 ${timeLeft < 20 ? 'text-red-600 animate-pulse' : 'text-[#5c4033]'}`}>
                        ⏳ {timeLeft}s
                    </span>
                )}
            </div>
            
            <div className="font-bold text-xl text-[#5c4033] opacity-50">VS</div>

            {/* AI/Opponent (Black) */}
            <div className={`flex flex-col items-center transition-all ${turn === Color.BLACK ? 'scale-105' : 'opacity-70'}`}>
                <div className="flex items-center space-x-2 bg-gray-300 px-3 py-1 rounded-full border border-gray-400">
                    <span className="w-3 h-3 rounded-full bg-black border border-white shadow-sm"></span>
                    <span className="font-bold text-black text-sm">{mode === 'pve' ? 'Gemini' : '对方'}</span>
                </div>
                {turn === Color.BLACK && !winner && (
                    <div className="flex flex-col items-center mt-1 min-h-[20px]">
                        {isAiThinking ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <span className="text-[10px] font-extrabold text-[#8B0000] mb-1">🔥 深度思考中</span>
                                <div className="flex space-x-1">
                                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce delay-75"></div>
                                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce delay-150"></div>
                                </div>
                            </div>
                        ) : (
                            <span className="text-xs font-mono font-bold text-[#5c4033]">⏳ {timeLeft}s</span>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Winner Overlay */}
      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm px-4">
          <div className="bg-[#f0dbb0] p-6 rounded-xl shadow-2xl border-4 border-[#5c4033] text-center w-full max-w-sm animate-bounce-in relative">
             <div className="absolute -top-10 left-1/2 transform -translate-x-1/2">
                {winner === Color.RED ? (
                    <div className="text-6xl">🏆</div>
                ) : winner === 'Draw' ? (
                    <div className="text-6xl">🤝</div>
                ) : (
                    <div className="text-6xl">💀</div>
                )}
             </div>

            <h2 className="text-2xl font-bold mt-8 mb-2 text-[#5c4033]">
              {winner === Color.RED ? "胜利!" : (winner === 'Draw' ? "和棋" : "失败")}
            </h2>
            <p className="mb-4 text-sm font-bold opacity-80 break-words">
               {resultMessage}
            </p>
            
            <div className="flex flex-col space-y-3">
                <button 
                onClick={() => {
                    setBoard(INITIAL_BOARD);
                    setHistoryStack([]);
                    setTurn(Color.RED);
                    setWinner(null);
                    setNoCaptureSteps(0);
                    setTimeLeft(TURN_TIME_LIMIT);
                }}
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
      <div className="w-full px-2 z-10 relative">
        <Board 
          board={board} 
          selectedPos={selectedPos} 
          validMoves={validMoves}
          onSelect={handleSelect}
          onMove={executeMove}
          turn={turn}
        />
      </div>

      {/* Controls Bar */}
      <div className="w-full max-w-[500px] px-4 mt-4 grid grid-cols-3 gap-3 z-20">
          <button 
            onClick={handleUndo}
            disabled={mode !== 'pve' || turn !== Color.RED || historyStack.length < 2 || !!winner}
            className="bg-[#d4b483] text-[#5c4033] py-2 rounded-lg font-bold shadow border-b-4 border-[#b08d55] active:border-b-0 active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
          >
              <span className="text-lg leading-none">↩️</span>
              <span className="text-xs">悔棋</span>
          </button>

          <button 
            onClick={handleDraw}
            disabled={!!winner}
            className="bg-[#d4b483] text-[#5c4033] py-2 rounded-lg font-bold shadow border-b-4 border-[#b08d55] active:border-b-0 active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
          >
              <span className="text-lg leading-none">🤝</span>
              <span className="text-xs">求和</span>
          </button>

          <button 
            onClick={handleSurrender}
            disabled={!!winner}
            className="bg-[#e6a3a3] text-[#8B0000] py-2 rounded-lg font-bold shadow border-b-4 border-[#c57878] active:border-b-0 active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center"
          >
              <span className="text-lg leading-none">🏳️</span>
              <span className="text-xs">认输</span>
          </button>
      </div>

      {/* Recent Moves Log */}
      <div className="w-full max-w-[500px] mt-4 px-4 z-10 flex-1 min-h-[100px]">
        <div className="h-full bg-white bg-opacity-60 rounded-lg border border-[#5c4033] p-2 text-xs font-mono scrollbar-hide shadow-inner flex flex-col relative">
           <div className="absolute top-0 right-0 bg-[#5c4033] text-[#f0dbb0] text-[10px] px-1 rounded-bl">
               {noCaptureSteps}/120 半步
           </div>
           <div className="overflow-y-auto flex-1">
              {moveHistory.length === 0 ? (
                <span className="text-gray-500 italic p-2 block text-center">对局开始... 红方先行</span>
              ) : (
                moveHistory.slice().reverse().map((move, idx) => (
                  <div key={idx} className="mb-1 border-b border-[#d4b483] border-opacity-30 pb-1 last:border-0">{move}</div>
                ))
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
