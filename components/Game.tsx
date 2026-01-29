
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Board } from './Board.tsx';
import { BoardState, Color, Move, PieceType, Position } from '../types.ts';
import { INITIAL_BOARD } from '../constants.ts';
import { getValidMoves, calculatePlayerLevel, hasLegalMoves, evaluateMaterial, boardToFen } from '../utils/gameLogic.ts';
import { getGeminiMove } from '../services/geminiService.ts';
import { getTopMoves, ponder } from '../utils/engine.ts';

interface Props {
  mode: 'pve' | 'pvp';
  onBack: () => void;
  invitedGameId?: string | null;
}

interface Suggestion {
  move: Move;
  score: number;
  desc: string;
  notation: string;
}

const TURN_TIME_LIMIT = 120;

export const Game: React.FC<Props> = ({ mode, onBack, invitedGameId }) => {
  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD);
  const [turn, setTurn] = useState<Color>(Color.RED);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [winner, setWinner] = useState<Color | 'Draw' | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  const [resultMessage, setResultMessage] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isPondering, setIsPondering] = useState(false);
  
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [historyStack, setHistoryStack] = useState<BoardState[]>([]);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  
  const hasDeducted = useRef(false);

  // ... (Keep existing Logic Hooks: Timer, Pondering, Suggestions, InitGame) ...
  // Timer
  useEffect(() => {
    if (winner || isInitializing || (mode === 'pve' && turn === Color.BLACK && isAiThinking)) return;
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

  // AI Pondering
  useEffect(() => {
      if (mode === 'pve' && turn === Color.RED && !winner && !isInitializing) {
          setIsPondering(true);
          const timer = setTimeout(() => {
             ponder(board, Color.BLACK);
             setIsPondering(false); 
          }, 1000);
          return () => clearTimeout(timer);
      } else {
          setIsPondering(false);
      }
  }, [turn, mode, board, winner, isInitializing]);

  // AI Suggestion
  useEffect(() => {
    if (turn === Color.RED && !winner && !isInitializing) {
        setIsSuggesting(true);
        const timer = setTimeout(() => {
            const hints = getTopMoves(board, Color.RED, 3);
            setSuggestions(hints);
            setIsSuggesting(false);
        }, 500); 
        return () => clearTimeout(timer);
    } else {
        setSuggestions([]);
        setIsSuggesting(false);
    }
  }, [turn, board, winner, isInitializing]);

  // Game Init
  useEffect(() => {
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const telegram_id = tgUser?.id?.toString() || "dev_user_123";

    if (mode === 'pve' && !hasDeducted.current) {
        hasDeducted.current = true;
        setIsInitializing(true);
        setStatusMessage("进入对局 (-30分)...");

        const deductPoints = async () => {
            try {
                const res = await fetch('/api/deduct_points', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegram_id, amount: 30 })
                });
                const data = res.ok ? await res.json() : { success: false };
                if (data.success) {
                    setStatusMessage(`对局开始`);
                } else {
                    setStatusMessage("免扣分模式");
                }
                setIsInitializing(false);
                setHistoryStack([INITIAL_BOARD.map(row => row.map(p => p ? {...p} : null))]);
            } catch (e) {
                setStatusMessage("离线模式");
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
         setStatusMessage("加入房间...");
         const joinGame = async () => {
             const username = tgUser?.username || "DevJoiner";
             try {
                const userRes = await fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`);
                const userData = await userRes.json();
                const userLevel = calculatePlayerLevel(userData.points || 0);

                const joinRes = await fetch('/api/join_game', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ telegram_id, game_id: invitedGameId, user_level: userLevel })
                });
                const joinData = await joinRes.json();
                if (joinData.success) {
                    setStatusMessage(joinData.message || "对局开始");
                    setIsInitializing(false);
                } else {
                    alert(joinData.error);
                    onBack();
                }
             } catch (e) {
                 setStatusMessage("连接失败");
                 onBack();
             }
         };
         joinGame();
    }
  }, [mode, invitedGameId, onBack]);

  // ... (Keep existing Logic: handleGameEnd, handleSelect, executeMove, undo, surrender, draw) ...
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
            await fetch('/api/game_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegram_id, result })
            });
        } catch (e) {}
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
        setValidMoves(getValidMoves(board, pos));
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
    if (!sourcePiece) return;
    newBoard[move.to.y][move.to.x] = { ...sourcePiece };
    newBoard[move.from.y][move.from.x] = null;
    setBoard(newBoard);
    setSelectedPos(null);
    setValidMoves([]);
    setTimeLeft(TURN_TIME_LIMIT); 
    const nextTurn = turn === Color.RED ? Color.BLACK : Color.RED;
    const currentFen = boardToFen(newBoard, nextTurn);
    setFenHistory(prev => {
        const newFenHistory = [...prev, currentFen];
        const occurrences = newFenHistory.filter(f => f === currentFen).length;
        if (occurrences >= 3) {
            setTimeout(() => handleGameEnd('Draw', "三次重复局面，和棋"), 500);
        }
        return newFenHistory;
    });
    const targetPiece = board[move.to.y][move.to.x];
    if (targetPiece && targetPiece.type === PieceType.GENERAL) {
      handleGameEnd(sourcePiece.color, "将死！");
      return;
    }
    if (!hasLegalMoves(newBoard, nextTurn)) {
         setTimeout(() => handleGameEnd(sourcePiece.color, "困毙获胜！"), 500);
         return;
    }
    setTurn(nextTurn);
  }, [board, turn, fenHistory]);

  const handleUndo = () => {
    if (mode !== 'pve' || turn !== Color.RED || winner) return;
    if (historyStack.length < 2) {
        alert("无法悔棋");
        return;
    }
    const prevBoard = historyStack[historyStack.length - 2];
    setBoard(prevBoard);
    setHistoryStack(prev => prev.slice(0, prev.length - 2));
    setFenHistory(prev => prev.slice(0, prev.length - 2));
    setTurn(Color.RED);
    setWinner(null);
    setTimeLeft(TURN_TIME_LIMIT);
    setSuggestions([]);
    setIsSuggesting(true);
  };

  const handleSurrender = () => {
      if (winner) return;
      if (confirm("确定投降？")) {
          handleGameEnd(turn === Color.RED ? Color.BLACK : Color.RED, "投降认输");
      }
  };

  const handleDraw = () => {
      if (winner) return;
      alert("AI: 暂时不接受和棋。");
  };

  // AI Turn
  useEffect(() => {
    if (mode === 'pve' && turn === Color.BLACK && !winner && !isInitializing) {
      const makeAiMove = async () => {
        setIsAiThinking(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        try {
          const move = await getGeminiMove(board);
          if (move) {
            executeMove(move);
          } else {
            handleGameEnd(Color.RED, "AI 认输");
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

  const handleSuggestionClick = (move: Move) => {
      setSelectedPos(move.from);
      setValidMoves(getValidMoves(board, move.from));
  };

  // ================= Renders =================

  // 1. River HUD Content
  const renderRiverHUD = () => (
      <>
        {/* Black Side (Left) */}
        <div className={`flex flex-col items-start justify-center pl-4 ${turn === Color.BLACK ? 'opacity-100 scale-105' : 'opacity-60'}`}>
            <span className="text-sm font-bold text-[#5c4033] leading-none">
                {mode === 'pve' ? 'Gemini AI' : '对方'}
            </span>
            <div className="flex items-center gap-1 mt-1">
                {turn === Color.BLACK && !winner ? (
                     isAiThinking ? (
                        <div className="flex space-x-1">
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce delay-75"></div>
                            <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce delay-150"></div>
                        </div>
                     ) : (
                        <span className="text-xs font-mono font-bold text-[#5c4033]">{timeLeft}s</span>
                     )
                ) : (
                    <span className="text-[10px] text-[#5c4033]">等待中</span>
                )}
            </div>
        </div>

        {/* Center Status */}
        {statusMessage && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#8B0000] text-white text-[10px] px-2 py-0.5 rounded shadow whitespace-nowrap opacity-80 z-20">
                {statusMessage}
            </div>
        )}

        {/* Red Side (Right) */}
        <div className={`flex flex-col items-end justify-center pr-4 ${turn === Color.RED ? 'opacity-100 scale-105' : 'opacity-60'}`}>
            <span className="text-sm font-bold text-[#8B0000] leading-none">我方</span>
            <div className="flex items-center gap-1 mt-1">
                {turn === Color.RED && !winner ? (
                    <span className={`text-xs font-mono font-bold ${timeLeft < 20 ? 'text-red-600 animate-pulse' : 'text-[#8B0000]'}`}>
                        {timeLeft}s
                    </span>
                ) : (
                    <>
                        {isPondering && <span className="text-[8px] animate-pulse">🧠 推演中</span>}
                        <span className="text-[10px] text-[#8B0000]">等待中</span>
                    </>
                )}
            </div>
        </div>
      </>
  );

  if (isInitializing) {
      return (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] text-[#5c4033] font-sans wood-texture z-50">
             <div className="w-16 h-16 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-xl font-bold animate-pulse">{statusMessage}</p>
          </div>
      );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#f0dbb0] text-[#4a3b2a] font-sans wood-texture overflow-hidden">
      {/* 1. Compact Header */}
      <header className="w-full h-12 shrink-0 flex justify-between items-center px-4 bg-[#5c4033] text-[#f0dbb0] shadow-md z-30">
        <button onClick={onBack} className="flex items-center space-x-1 hover:text-[#d4b483]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
        </button>
        <span className="text-sm font-bold tracking-wider">中国象棋</span>
        <div className="w-5"></div>
      </header>

      {/* 2. Controls Bar (Top) */}
      <div className="w-full shrink-0 p-2 z-20 bg-[#f0dbb0]/50 backdrop-blur-sm border-b border-[#5c4033]/20">
          <div className="grid grid-cols-3 gap-2 max-w-[400px] mx-auto">
              <button 
                onClick={handleUndo}
                disabled={mode !== 'pve' || turn !== Color.RED || historyStack.length < 2 || !!winner}
                className="bg-[#d4b483] text-[#5c4033] py-1.5 rounded shadow active:scale-95 disabled:opacity-50 text-xs font-bold border border-[#b08d55]"
              >
                  ↩️ 悔棋
              </button>
              <button 
                onClick={handleDraw}
                disabled={!!winner}
                className="bg-[#d4b483] text-[#5c4033] py-1.5 rounded shadow active:scale-95 disabled:opacity-50 text-xs font-bold border border-[#b08d55]"
              >
                  🤝 求和
              </button>
              <button 
                onClick={handleSurrender}
                disabled={!!winner}
                className="bg-[#e6a3a3] text-[#8B0000] py-1.5 rounded shadow active:scale-95 disabled:opacity-50 text-xs font-bold border border-[#c57878]"
              >
                  🏳️ 认输
              </button>
          </div>
      </div>

      {/* 3. Board Area (Middle) */}
      <div className="w-full shrink-0 px-1 py-2 z-10 flex justify-center bg-[#f0dbb0]">
        <div className="w-full max-w-[420px]">
            <Board 
              board={board} 
              selectedPos={selectedPos} 
              validMoves={validMoves}
              onSelect={handleSelect}
              onMove={executeMove}
              turn={turn}
              riverContent={renderRiverHUD()} // Inject HUD here
            />
        </div>
      </div>

      {/* 4. Winner Overlay (Absolute) */}
      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-8">
          <div className="bg-[#f0dbb0] p-6 rounded-xl shadow-2xl border-4 border-[#5c4033] text-center w-full max-w-sm animate-bounce-in">
             <div className="text-6xl mb-4">{winner === Color.RED ? '🏆' : (winner === 'Draw' ? '🤝' : '💀')}</div>
            <h2 className="text-2xl font-bold mb-2 text-[#5c4033]">
              {winner === Color.RED ? "胜利!" : (winner === 'Draw' ? "和棋" : "失败")}
            </h2>
            <p className="mb-6 text-sm opacity-80">{resultMessage}</p>
            <div className="space-y-3">
                <button 
                onClick={() => {
                    setBoard(INITIAL_BOARD);
                    setHistoryStack([]);
                    setFenHistory([]);
                    setTurn(Color.RED);
                    setWinner(null);
                    setTimeLeft(TURN_TIME_LIMIT);
                }}
                className="w-full bg-[#8B0000] text-white py-3 rounded-lg font-bold hover:bg-red-900"
                >
                再来一局
                </button>
                <button 
                onClick={onBack}
                className="w-full bg-[#5c4033] text-white py-3 rounded-lg font-bold"
                >
                返回大厅
                </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. AI Strategist (Bottom Fill) */}
      <div className="flex-1 min-h-0 w-full flex flex-col bg-white/60 border-t-2 border-[#5c4033]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] relative">
        <div className="bg-[#5c4033] text-[#f0dbb0] text-xs font-bold px-3 py-1 flex justify-between items-center shadow-sm z-10">
            <span className="flex items-center gap-1">🧠 军师锦囊 <span className="text-[10px] opacity-70 font-normal">(点击应用)</span></span>
            {isSuggesting && <span className="animate-spin">⚙️</span>}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 pb-safe-area">
              {turn === Color.BLACK ? (
                  <div className="flex items-center justify-center h-full text-[#5c4033]/50 text-sm italic">
                      思考中...
                  </div>
              ) : isSuggesting ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 opacity-60">
                      <div className="w-5 h-5 border-2 border-[#8B0000] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-[#5c4033]">推演变化中...</span>
                  </div>
              ) : suggestions.length > 0 ? (
                  suggestions.map((sug, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleSuggestionClick(sug.move)}
                        className="flex items-center justify-between bg-[#f0dbb0]/80 p-2 rounded border border-[#5c4033]/10 active:bg-[#d4b483] active:scale-[0.99] transition-all cursor-pointer shadow-sm"
                      >
                          <div className="flex items-center gap-3">
                              <span className={`w-5 h-5 flex items-center justify-center font-bold font-mono text-xs rounded ${idx === 0 ? 'bg-[#8B0000] text-white' : 'bg-[#5c4033] text-white'}`}>
                                  {idx + 1}
                              </span>
                              <div className="flex flex-col">
                                  <span className="text-[#8B0000] font-bold text-sm leading-tight">{sug.notation}</span>
                                  <span className="text-[10px] text-[#5c4033] leading-tight mt-0.5">{sug.desc}</span>
                              </div>
                          </div>
                          <div className="text-[10px] text-[#5c4033] font-mono opacity-50 bg-[#fff]/30 px-1 rounded">
                              {sug.score}
                          </div>
                      </div>
                  ))
              ) : (
                  <div className="flex items-center justify-center h-full text-[#5c4033]/50 text-sm">
                      暂无建议
                  </div>
              )}
        </div>
      </div>
    </div>
  );
};
