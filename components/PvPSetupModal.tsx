
import React, { useState } from 'react';
import { User } from '../types.ts';
import { calculatePlayerLevel } from '../utils/gameLogic.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  botAppUrl: string; // 用于生成邀请链接
}

type RestrictionMode = 'any' | 'ranked';

export const PvPSetupModal: React.FC<Props> = ({ isOpen, onClose, user, botAppUrl }) => {
  const [step, setStep] = useState<'config' | 'invite'>('config');
  const [restriction, setRestriction] = useState<RestrictionMode>('any');
  const [minLevel, setMinLevel] = useState<number>(user ? calculatePlayerLevel(user.points || 0) : 0);
  
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);

  // @ts-ignore
  const WebApp = window.Telegram?.WebApp;

  const safeAlert = (msg: string) => {
    if (WebApp?.showAlert) {
       WebApp.showAlert(msg);
    } else {
       alert(msg);
    }
  };

  const handleCreatePvP = async () => {
      if (isCreatingGame || !user) return;
      setIsCreatingGame(true);

      const targetMinLevel = restriction === 'any' ? 0 : minLevel;

      try {
          const res = await fetch('/api/create_game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  telegram_id: user.telegram_id,
                  min_level: targetMinLevel 
              })
          });
          
          const data = await res.json();
          if (data.success) {
              // 构建深度链接: t.me/bot/app?startapp=game_ID
              const link = `${botAppUrl}?startapp=game_${data.game_id}`;
              setInviteLink(link);
              setStep('invite');
          } else {
              safeAlert("创建房间失败: " + (data.error || "未知错误"));
          }
      } catch (e) {
          safeAlert("创建房间失败，网络错误。");
      } finally {
          setIsCreatingGame(false);
      }
  };

  const handleShareInvite = () => {
      if (!inviteLink) return;
      
      let text = "来局象棋？点击链接直接加入我的房间对战！";
      if (restriction === 'ranked') {
          text = `【挑战书】我摆下了擂台（门槛 Lv.${minLevel}），敢来应战吗？`;
      }

      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
      
      if (WebApp?.openTelegramLink) {
          WebApp.openTelegramLink(shareUrl);
      } else {
          window.open(shareUrl, '_blank');
      }
  };

  const resetAndClose = () => {
      setInviteLink(null);
      setStep('config');
      setIsCreatingGame(false);
      setRestriction('any'); // 重置状态
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
        <div className="bg-[#f0dbb0] w-full max-w-sm rounded-3xl border-4 border-[#5c4033] p-8 relative shadow-2xl animate-in zoom-in duration-200">
            <button onClick={resetAndClose} className="absolute top-4 right-4 p-2 hover:bg-black/10 rounded-full transition text-[#5c4033]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-3xl font-black text-center text-[#5c4033] border-b-2 border-[#5c4033] pb-4 mb-6">创建棋室</h2>
            
            {step === 'config' && (
                <div className="space-y-6">
                    <p className="text-[#5c4033] font-bold text-center mb-2">选择对战模式</p>
                    
                    {/* 模式选择 */}
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setRestriction('any')}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 ${restriction === 'any' ? 'bg-[#5c4033] text-[#f0dbb0] border-[#3e2b22] shadow-inner scale-105' : 'bg-transparent border-[#5c4033] text-[#5c4033] opacity-60 hover:opacity-100'}`}
                        >
                            <span className="text-3xl">🎉</span>
                            <span className="font-bold text-sm">无门槛</span>
                        </button>
                        <button 
                            onClick={() => setRestriction('ranked')}
                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center space-y-2 ${restriction === 'ranked' ? 'bg-[#8B0000] text-[#f0dbb0] border-[#600000] shadow-inner scale-105' : 'bg-transparent border-[#8B0000] text-[#8B0000] opacity-60 hover:opacity-100'}`}
                        >
                            <span className="text-3xl">🏆</span>
                            <span className="font-bold text-sm">高手局</span>
                        </button>
                    </div>

                    {/* 详细设置区 */}
                    <div className="min-h-[80px] flex items-center justify-center bg-[#5c4033]/5 rounded-xl p-2 border border-[#5c4033]/10">
                        {restriction === 'any' ? (
                            <p className="text-sm text-[#5c4033] opacity-80 text-center px-2">
                                适合好友娱乐，任何等级的玩家均可点击链接加入。
                            </p>
                        ) : (
                            <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-2 px-2">
                                <div className="flex justify-between text-sm font-bold text-[#5c4033]">
                                    <span>最低等级限制</span>
                                    <span className="text-[#8B0000] bg-white px-2 rounded border border-[#8B0000]/20">Lv.{minLevel}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    step="1"
                                    value={minLevel}
                                    onChange={(e) => setMinLevel(parseInt(e.target.value))}
                                    className="w-full h-2 bg-[#5c4033]/20 rounded-lg appearance-none cursor-pointer accent-[#8B0000]"
                                />
                                <p className="text-[10px] text-[#5c4033] opacity-60 text-center">
                                    对手需达到 Lv.{minLevel} 才可加入对局
                                </p>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={handleCreatePvP} 
                        disabled={isCreatingGame}
                        className="w-full bg-gradient-to-r from-[#5c4033] to-[#3e2b22] text-[#f0dbb0] py-4 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3 mt-2"
                    >
                        {isCreatingGame ? (
                             <><div className="w-5 h-5 border-2 border-[#f0dbb0] border-t-transparent rounded-full animate-spin"></div>创建中...</>
                        ) : "生成邀请函"}
                    </button>
                </div>
            )}

            {step === 'invite' && (
                <div className="space-y-6 text-center animate-in slide-in-from-right-8 duration-300">
                    <div className="p-4 bg-[#5c4033]/10 border-2 border-[#5c4033]/30 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 bg-[#8B0000] text-white text-[10px] px-2 py-0.5 rounded-br-lg font-bold shadow-sm">
                            {restriction === 'any' ? '娱乐模式' : `门槛 Lv.${minLevel}+`}
                        </div>
                        <p className="text-[#5c4033] font-bold mt-3 text-lg">✅ 房间已就绪</p>
                        <div className="bg-white/60 p-3 rounded-lg border border-[#5c4033]/20 mt-3 flex items-center justify-between gap-2">
                             <p className="text-xs text-[#5c4033] opacity-80 font-mono truncate flex-1 text-left">
                                {inviteLink}
                             </p>
                             <button 
                                onClick={() => {
                                    if(inviteLink) {
                                        navigator.clipboard.writeText(inviteLink);
                                        safeAlert("已复制！");
                                    }
                                }}
                                className="text-[10px] bg-[#5c4033] text-white px-2 py-1 rounded hover:bg-[#3e2b22]"
                             >
                                复制
                             </button>
                        </div>
                    </div>

                    <button 
                        onClick={handleShareInvite} 
                        className="w-full bg-gradient-to-r from-[#0088cc] to-[#006699] text-white py-4 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3"
                    >
                        <span>📤 一键发送给好友</span>
                    </button>
                    
                    <button 
                         onClick={resetAndClose}
                        className="text-[#5c4033] text-sm underline opacity-60 hover:opacity-100"
                    >
                        返回大厅
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};
