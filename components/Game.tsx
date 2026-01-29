
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Board } from './Board.tsx';
import { BoardState, Color, Move, PieceType, Position } from '../types.ts';
import { INITIAL_BOARD } from '../constants.ts';
import { getValidMoves, calculatePlayerLevel, hasLegalMoves, evaluateMaterial, boardToFen } from '../utils/gameLogic.ts';
import { getGeminiMove } from '../services/geminiService.ts';
import { getTopMoves } from '../utils/engine.ts';

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
  
  // 新增：AI 建议状态
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  const [resultMessage, setResultMessage] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  
  const [timeLeft, setTimeLeft] = useState(TURN_TIME_LIMIT);
  const [historyStack, setHistoryStack] = useState<BoardState[]>([]);
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [noCaptureSteps, setNoCaptureSteps] = useState(0);

  const hasDeducted = useRef(false);

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

  // AI 军师建议 (当轮到红方时)
  useEffect(() => {
    if (turn === Color.RED && !winner && !isInitializing) {
        setIsSuggesting(true);
        // 使用 setTimeout 让出主线程，避免渲染阻塞
        const timer = setTimeout(() => {
            // 在 PVE 或 PVP 中都可以给红方建议
            const hints = getTopMoves(board, Color.RED, 3);
            setSuggestions(hints);
            setIsSuggesting(false);
        }, 500); // 稍微延迟一点，让 UI 先渲染出来
        return () => clearTimeout(timer);
    } else {
        setSuggestions([]);
        setIsSuggesting(false);
    }
  }, [turn, board, winner, isInitializing]);

  // Init Game
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
                const data = res.ok ? await res.json() : { success: false };
                if (data.success) {
                    setStatusMessage(`对局开始 (当前积分: ${data.points})`);
                } else {
                    setStatusMessage("对局开始 (离线/免扣分)");
                }
                setIsInitializing(false);
                setHistoryStack([INITIAL_BOARD.map(row => row.map(p => p ? {...p} : null))]);
            } catch (e) {
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
                const userLevel = calculatePlayerLevel(userData.points || 0);

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
                 setStatusMessage("连接失败");
                 onBack();
             }
         };
         joinGame();
    }
  }, [mode, invitedGameId, onBack]);

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
            if (data.success) setResultMessage(`${reason} ${data.message}`);
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
        const moves = getValidMoves(board, pos);
        setValidMoves(moves);
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
    
    const nextTurn = turn === Color.RED ? Color.BLACK : Color.RED;
    const currentFen = boardToFen(newBoard, nextTurn);
    setFenHistory(prev => {
        const newFenHistory = [...prev, currentFen];
        const occurrences = newFenHistory.filter(f => f === currentFen).length;
        if (occurrences >= 3) {
            setTimeout(() => handleGameEnd('Draw', "三次重复局面，自动和棋"), 500);
        }
        return newFenHistory;
    });

    if (targetPiece && targetPiece.type === PieceType.GENERAL) {
      handleGameEnd(sourcePiece.color, "将死！");
      return;
    }

    if (!hasLegalMoves(newBoard, nextTurn)) {
         setTimeout(() => handleGameEnd(sourcePiece.color, "对方无棋可走 (困毙)，胜利！"), 500);
         return;
    }

    setTurn(nextTurn);
  }, [board, turn, fenHistory]);

  const handleUndo = () => {
    if (mode !== 'pve' || turn !== Color.RED || winner) return;
    if (historyStack.length < 2) {
        alert("无法悔棋 (开局或记录不足)");
        return;
    }
    const prevBoard = historyStack[historyStack.length - 2];
    setBoard(prevBoard);
    setHistoryStack(prev => prev.slice(0, prev.length - 2));
    setFenHistory(prev => prev.slice(0, prev.length - 2));
    setTurn(Color.RED);
    setWinner(null);
    setTimeLeft(TURN_TIME_LIMIT);
    // 重置 AI 建议
    setSuggestions([]);
    setIsSuggesting(true);
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
          const redScore = evaluateMaterial(board, Color.RED);
          const blackScore = evaluateMaterial(board, Color.BLACK); 
          const aiAdvantage = blackScore - redScore;
          
          if (aiAdvantage > 300) {
              alert(`Gemini: "我现在兵力优势明显 (+${aiAdvantage})，拒绝和棋！"`);
          } else if (aiAdvantage < -100) {
              handleGameEnd('Draw', "Gemini: " + "局面不利，同意和棋。");
          } else if (historyStack.length > 30 && Math.abs(aiAdvantage) < 200) {
              handleGameEnd('Draw', "Gemini: " + "势均力敌，同意和棋。");
          } else {
              alert(`Gemini: "战斗才刚刚开始，暂时不想和棋。"`);
          }
      } else {
          alert("对方拒绝了您的求和请求。(PVP尚未实装协商逻辑)");
      }
  };

  // AI Turn
  useEffect(() => {
    if (mode === 'pve' && turn === Color.BLACK && !winner && !isInitializing) {
      const makeAiMove = async () => {
        setIsAiThinking(true);
        // 让 UI 线程喘口气
        await new Promise(resolve => setTimeout(resolve, 300));
        
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

  const handleSuggestionClick = (move: Move) => {
      setSelectedPos(move.from);
      setValidMoves(getValidMoves(board, move.from));
      // Optional: visualize hint better
  };

  if (isInitializing) {
      return (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] text-[#5c4033] font-sans wood-texture z-50">
             <div className="w-16 h-16 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-xl font-bold animate-pulse">{statusMessage}</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#f0dbb0] text-[#4a3b2a] font-sans pb-4 wood-texture">
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
             <span className="text-[10px] opacity-80">Gemini 3 Pro (Lv.9)</span>
        </div>
        <div className="w-10"></div>
      </header>

      {/* Game Status & Timer */}
      <div className="w-full max-w-[500px] p-4 flex flex-col items-center z-10">
        <div className="w-full flex justify-between items-center bg-[#ebd4a9] p-2 rounded-lg border border-[#d4b483] shadow-inner">
            {/* Player (Red) */}
            <div className={`flex flex-col items-center transition-all ${turn === Color.RED ? 'scale-105' : 'opacity-70'}`}>
                <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full border border-red-300">
                    <span className="w-3 h-3 rounded-full bg-red-600 border border-white shadow-sm"></span>
                    <span className="font-bold text-[#8B0000] text-sm">我方</span>
                </div>
                {turn === Color.RED && !winner && (
                    <span className={`text-xs font-mono font-bold mt-1 ${timeLeft < 10 ? 'text-red-600 animate-pulse font-extrabold scale-110' : 'text-[#5c4033]'}`}>
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
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-[#8B0000] animate-pulse">思考中</span>
                                <div className="flex space-x-0.5">
                                    <div className="w-1 h-1 bg-black rounded-full animate-bounce"></div>
                                    <div className="w-1 h-1 bg-black rounded-full animate-bounce delay-75"></div>
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
                    setFenHistory([]);
                    setTurn(Color.RED);
                    setWinner(null);
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

      {/* AI Assistant (Replacing Move History) */}
      <div className="w-full max-w-[500px] mt-4 px-4 z-10 flex-1 min-h-[140px]">
        <div className="h-full bg-white bg-opacity-70 rounded-xl border-2 border-[#5c4033]/30 p-3 shadow-lg flex flex-col relative overflow-hidden">
           <div className="absolute top-0 left-0 bg-[#5c4033] text-[#f0dbb0] text-[10px] px-2 py-0.5 rounded-br-lg font-bold z-10 shadow-sm flex items-center gap-1">
               <span>🧠 AI 军师</span>
               {isSuggesting && <span className="animate-spin">⚙️</span>}
           </div>

           <div className="mt-4 flex flex-col gap-2 overflow-y-auto flex-1 pb-1">
              {turn === Color.BLACK ? (
                  <div className="flex items-center justify-center h-full text-[#5c4033]/60 text-sm italic">
                      等待对方走棋...
                  </div>
              ) : isSuggesting ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-2">
                      <div className="w-5 h-5 border-2 border-[#8B0000] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-[#5c4033]">军师正在推演局势...</span>
                  </div>
              ) : suggestions.length > 0 ? (
                  suggestions.map((sug, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleSuggestionClick(sug.move)}
                        className="flex items-center justify-between bg-[#f0dbb0]/50 hover:bg-[#d4b483]/50 p-2 rounded-lg border border-[#5c4033]/10 cursor-pointer transition-colors active:scale-[0.99]"
                      >
                          <div className="flex items-center gap-3">
                              <span className={`font-bold font-mono text-sm px-1.5 py-0.5 rounded ${idx === 0 ? 'bg-[#8B0000] text-white' : 'bg-[#5c4033] text-white'}`}>
                                  {idx + 1}
                              </span>
                              <div className="flex flex-col">
                                  <span className="text-[#8B0000] font-bold text-sm">{sug.notation}</span>
                                  <span className="text-[10px] text-[#5c4033]">{sug.desc}</span>
                              </div>
                          </div>
                          <div className="flex text-[10px] text-[#5c4033] opacity-60">
                              推荐度 {Array(3-idx).fill('★').join('')}
                          </div>
                      </div>
                  ))
              ) : (
                  <div className="flex items-center justify-center h-full text-[#5c4033]/60 text-sm">
                      暂无建议
                  </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
