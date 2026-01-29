
import React, { useEffect, useState } from 'react';
import { User } from '../types.ts';
import { DEFAULT_TELEGRAM_GROUP_URL, DEFAULT_TELEGRAM_BOT_APP_URL } from '../constants.ts';
import { PaymentModal } from './PaymentModal.tsx';
import { PvPSetupModal } from './PvPSetupModal.tsx';

interface Props {
  onStartGame: (mode: 'pve' | 'pvp') => void;
}

export const Lobby: React.FC<Props> = ({ onStartGame }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // 模态框状态管理
  const [isPvPModalOpen, setIsPvPModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  const [config, setConfig] = useState({
      groupUrl: DEFAULT_TELEGRAM_GROUP_URL,
      botAppUrl: DEFAULT_TELEGRAM_BOT_APP_URL
  });

  // @ts-ignore
  const WebApp = window.Telegram?.WebApp;

  const initUser = async () => {
      setLoading(true);

      WebApp?.ready();
      WebApp?.expand();

      const tgUser = WebApp?.initDataUnsafe?.user;
      const telegram_id = tgUser?.id?.toString() || "dev_user_123";
      const username = tgUser?.username || "DevPlayer";

      try {
        const [userRes, configRes] = await Promise.all([
             fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`).catch(() => ({ ok: false, status: 404 } as Response)),
             fetch('/api/config').catch(() => ({ ok: false, json: () => Promise.resolve({}) } as any))
        ]);

        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        } else {
          console.warn(`API 初始化失败 (${userRes.status})，进入本地/访客模式`);
          setUser({
            id: 0,
            telegram_id: telegram_id,
            username: `${username} (访客)`,
            points: 1000 
          });
          if (userRes.status !== 404) {
            WebApp?.showAlert?.(`服务器连接不稳定 (${userRes.status})，已启用访客模式。在线对弈功能可能受限。`);
          }
        }

        if (configRes && configRes.ok) {
            const configData = await configRes.json();
            setConfig({
                groupUrl: configData.group_url || DEFAULT_TELEGRAM_GROUP_URL,
                botAppUrl: configData.bot_app_url || DEFAULT_TELEGRAM_BOT_APP_URL
            });
        }
      } catch (error: any) {
        console.error("Initialization error:", error);
        setUser({ id: 0, telegram_id, username, points: 500 });
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    initUser();
  }, []);

  const safeAlert = (msg: string) => {
      if (WebApp?.showAlert) {
         WebApp.showAlert(msg);
      } else {
         alert(msg);
      }
  };

  const handleSignIn = async () => {
    if (!user || user.id === 0) { safeAlert("访客模式不支持签到。"); return; }
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: user.telegram_id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
          setUser(prev => prev ? { ...prev, points: data.points } : null);
          safeAlert(data.message);
      } else {
          safeAlert(data.message || "今日签到已领过。");
      }
    } catch (e) { safeAlert("签到失败，请稍后再试。"); } finally { setIsSigningIn(false); }
  };

  const handleJoinGroup = () => {
    WebApp?.openTelegramLink ? WebApp.openTelegramLink(config.groupUrl) : window.open(config.groupUrl, '_blank');
  };

  if (loading) return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] wood-texture">
        <div className="w-16 h-16 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-[#5c4033] animate-pulse">正在进入博弈大厅...</p>
    </div>
  );

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#f0dbb0] text-[#4a3b2a] font-sans wood-texture relative overflow-hidden">
      {/* 顶部交互区 */}
      <div className="w-full p-4 flex justify-between items-start z-20">
        <button onClick={handleSignIn} className="flex flex-col items-center space-y-1 transition active:scale-90">
          <div className="w-12 h-12 bg-gradient-to-b from-[#8B0000] to-[#600000] rounded-full flex items-center justify-center text-white shadow-xl border-2 border-[#d4b483]">
            {isSigningIn ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <span className="text-xl font-bold">签</span>}
          </div>
          <span className="text-[10px] font-bold text-[#5c4033]">每日领分</span>
        </button>

        <div className="flex flex-col items-center">
            <div className="bg-[#8B0000] text-white text-[10px] px-3 py-1 rounded-t-lg border-x border-t border-[#d4b483] font-bold shadow-md">
                {user?.id === 0 ? '访客模式' : `Lv.${Math.floor((user?.points||0)/1000)} 棋士`}
            </div>
            <div className="flex items-center bg-[#5c4033] rounded-full p-1 pr-1 gap-2 border-2 border-[#8B0000] shadow-lg">
                <div className="flex items-center space-x-1 px-3">
                    <span className="text-yellow-400 drop-shadow-sm">🪙</span>
                    <span className="text-[#d4b483] font-bold text-base min-w-[40px] text-center">{user?.points || 0}</span>
                </div>
                <button 
                  onClick={() => user?.id !== 0 && setIsPaymentModalOpen(true)} 
                  className="bg-[#d4b483] text-[#5c4033] rounded-full w-7 h-7 flex items-center justify-center font-bold shadow-inner active:scale-110 transition"
                >
                  +
                </button>
            </div>
        </div>

        <button onClick={handleJoinGroup} className="flex flex-col items-center space-y-1 transition active:scale-90">
          <div className="w-12 h-12 bg-gradient-to-b from-[#4a6b8a] to-[#2c4052] rounded-full flex items-center justify-center text-white shadow-xl border-2 border-[#d4b483]">
             <span className="text-sm">社区</span>
          </div>
          <span className="text-[10px] font-bold text-[#5c4033]">联系棋友</span>
        </button>
      </div>

      {/* 主标题与模式选择 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-10 z-10">
        <div className="text-center space-y-2">
            <h1 className="text-6xl font-extrabold text-[#5c4033] tracking-widest font-serif drop-shadow-lg animate-fade-in">中国象棋</h1>
            <div className="h-1 w-32 bg-[#8B0000] mx-auto rounded-full"></div>
            <p className="text-[#8B0000] font-bold italic opacity-90 text-sm">-- Powered by Gemini 3 Pro --</p>
        </div>

        <div className="w-full max-w-sm space-y-6">
            <button 
              onClick={() => user?.points! >= 30 ? onStartGame('pve') : safeAlert("您的积分不足 30（当前：" + user?.points + "），请先签到或充值。")} 
              className="w-full bg-gradient-to-br from-[#8B0000] to-[#600000] text-[#f0dbb0] p-6 rounded-3xl shadow-2xl flex items-center justify-between border-2 border-[#5c4033] hover:brightness-110 active:scale-95 transition-all"
            >
                <div className="text-left">
                  <span className="text-2xl font-black block tracking-wide">人机对战</span>
                  <span className="text-xs opacity-75 mt-1 block">挑战国手级 AI 引擎 (30分/局)</span>
                </div>
                <div className="text-5xl animate-pulse">🤖</div>
            </button>

            <button 
              disabled={user?.id === 0} 
              onClick={() => setIsPvPModalOpen(true)} 
              className={`w-full bg-gradient-to-br from-[#5c4033] to-[#3e2b22] text-[#f0dbb0] p-6 rounded-3xl shadow-2xl flex items-center justify-between border-2 border-[#2c1d17] hover:brightness-110 active:scale-95 transition-all ${user?.id === 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            >
                <div className="text-left">
                  <span className="text-2xl font-black block tracking-wide">好友对弈</span>
                  <span className="text-xs opacity-75 mt-1 block">邀请好友 实时在线博弈</span>
                </div>
                <div className="text-5xl">⚔️</div>
            </button>
        </div>
      </div>

      {/* 模块化组件 */}
      <PaymentModal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        user={user}
        onSuccess={initUser}
      />
      
      <PvPSetupModal
        isOpen={isPvPModalOpen}
        onClose={() => setIsPvPModalOpen(false)}
        user={user}
        botAppUrl={config.botAppUrl}
      />

      {/* 底部纹理装饰 */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#8B0000] opacity-30"></div>
    </div>
  );
};
