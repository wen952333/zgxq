
import React, { useEffect, useState } from 'react';
import { User } from '../types.ts';
import { DEFAULT_TELEGRAM_GROUP_URL, DEFAULT_TELEGRAM_BOT_APP_URL } from '../constants.ts';

interface Props {
  onStartGame: (mode: 'pve' | 'pvp') => void;
}

export const Lobby: React.FC<Props> = ({ onStartGame }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showPvPModal, setShowPvPModal] = useState(false);
  
  // Buy Modal State
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyAmount, setBuyAmount] = useState<string>('50');
  const [isBuying, setIsBuying] = useState(false);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  
  // Dynamic Configuration
  const [config, setConfig] = useState({
      groupUrl: DEFAULT_TELEGRAM_GROUP_URL,
      botAppUrl: DEFAULT_TELEGRAM_BOT_APP_URL
  });

  const initUser = async () => {
      setLoading(true);
      setErrorMsg(null);

      // Tell Telegram app we are ready
      // @ts-ignore
      window.Telegram?.WebApp?.ready();
      // @ts-ignore
      window.Telegram?.WebApp?.expand();

      // @ts-ignore
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      
      const telegram_id = tgUser?.id?.toString() || "dev_user_123";
      const username = tgUser?.username || "DevPlayer";

      try {
        const [userRes, configRes] = await Promise.all([
             fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`),
             fetch('/api/config')
        ]);

        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        } else {
          const errText = await userRes.text();
          let msg = errText;
          try {
             const json = JSON.parse(errText);
             if (json.error) msg = json.error;
          } catch(e) {}
          throw new Error(`User API Error (${userRes.status}): ${msg}`);
        }

        if (configRes.ok) {
            const configData = await configRes.json();
            setConfig({
                groupUrl: configData.group_url || DEFAULT_TELEGRAM_GROUP_URL,
                botAppUrl: configData.bot_app_url || DEFAULT_TELEGRAM_BOT_APP_URL
            });
        }
      } catch (error: any) {
        console.error("Failed to fetch initial data:", error);
        setErrorMsg(error.message || "连接服务器失败");
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    initUser();
  }, []);

  // Helper for consistent alerts
  const safeAlert = (msg: string) => {
      // @ts-ignore
      if (window.Telegram?.WebApp?.showAlert) {
         // @ts-ignore
         window.Telegram.WebApp.showAlert(msg);
      } else {
         alert(msg);
      }
  };

  const handleSignIn = async () => {
    if (!user) { safeAlert("正在连接服务器，请稍后..."); return; }
    if (isSigningIn) return;

    setIsSigningIn(true);
    
    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: user.telegram_id })
      });
      const data = await res.json();
      
      if (res.ok) {
          if (data.success) {
            setUser(prev => prev ? { ...prev, points: data.points } : null);
            safeAlert(data.message);
          } else {
            safeAlert(data.message);
          }
      } else {
          safeAlert("签到失败: " + (data.error || "服务端错误"));
      }
    } catch (e) {
      console.error(e);
      safeAlert("网络错误，请检查网络连接");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleOpenBuyModal = () => {
    if (!user) { safeAlert("数据加载中，请稍后再试。"); return; }
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;
    
    if (!WebApp?.initData) {
        safeAlert("环境检测：未在 Telegram 内运行。\n支付功能无法调用。");
        return;
    }
    setShowBuyModal(true);
  };

  const handleConfirmBuy = async () => {
    const starsToBuy = parseInt(buyAmount);
    if (!starsToBuy || starsToBuy <= 0) {
        safeAlert("请输入有效的数量");
        return;
    }
    
    const pointsToGet = starsToBuy * 500;
    
    if (isBuying) return;
    setIsBuying(true);
    
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;

    try {
        // 1. Get Invoice Link from Backend
        const invoiceRes = await fetch('/api/create_invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: user!.telegram_id, stars: starsToBuy })
        });
        
        const invoiceData = await invoiceRes.json();
        
        if (!invoiceData.success) {
            WebApp.showAlert("创建订单失败: " + (invoiceData.details || invoiceData.error || "BOT_TOKEN 未配置"));
            setIsBuying(false);
            return;
        }

        const invoiceLink = invoiceData.invoice_link;
        console.log("Invoice Link:", invoiceLink);

        // Close modal to show invoice cleanly
        setShowBuyModal(false);

        // 2. Open Telegram Native Invoice
        // We handle potential failures by falling back to opening the link directly
        WebApp.openInvoice(invoiceLink, async (status: string) => {
            setIsBuying(false);
            
            if (status === 'paid') {
                try {
                    // Note: Ideally this should be handled by a webhook on backend for security
                    const creditRes = await fetch('/api/buy_points', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ telegram_id: user!.telegram_id, stars: starsToBuy })
                    });
                    const creditData = await creditRes.json();
                    
                    if (creditData.success) {
                        setUser(prev => prev ? { ...prev, points: creditData.points } : null);
                        WebApp.showAlert(`支付成功！\n已到账 ${pointsToGet} 积分`);
                    }
                } catch (e) {
                    WebApp.showAlert("支付成功，但积分更新超时，请稍后刷新。");
                }
            } else if (status === 'cancelled') {
                // cancelled by user
            } else if (status === 'failed') {
                // Fallback: Try to open the link directly if the Mini App API failed
                WebApp.openTelegramLink(invoiceLink);
            } else {
                WebApp.showAlert("支付状态: " + status);
            }
        });

    } catch (e) {
        WebApp.showAlert("请求支付系统出错");
        setIsBuying(false);
    }
  };

  const handleJoinGroup = () => {
    const url = config.groupUrl;
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;
    if (WebApp && WebApp.openTelegramLink) {
        WebApp.openTelegramLink(url);
    } else {
        window.open(url, '_blank');
    }
  };

  const calculateLevel = (points: number) => {
    if (points < 1000) return 0;
    return Math.floor(points / 1000);
  };

  const handlePvPClick = () => {
    if (!user) { safeAlert("请等待数据加载完成..."); return; }
    setShowPvPModal(true);
    setInviteLink(null); 
  };

  const handleStartPvE = () => {
      if (!user) { safeAlert("请等待数据加载完成..."); return; }
      if (user.points < 30) { safeAlert("积分不足 30，无法开始对局！请签到或购买积分。"); return; }
      onStartGame('pve');
  };

  const createGameSession = async (minLevel: number) => {
    if (!user) return;
    setIsCreatingGame(true);

    try {
        const res = await fetch('/api/create_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: user.telegram_id, min_level: minLevel })
        });
        const data = await res.json();
        
        if (data.success) {
            const link = `${config.botAppUrl}?startapp=game_${data.game_id}`;
            setInviteLink(link);
        } else {
            safeAlert("创建对局失败: " + data.error);
        }
    } catch (e) {
        safeAlert("网络错误");
    } finally {
        setIsCreatingGame(false);
    }
  };

  const startPvP = async (restricted: boolean) => {
    if (!user) return;
    
    if (user.points < 30) {
        safeAlert("积分不足 30，无法开始游戏！");
        return;
    }

    const myLevel = calculateLevel(user.points);
    const minLevel = restricted ? Math.max(0, myLevel - 1) : 0;
    await createGameSession(minLevel);
  };

  const shareInvite = () => {
    if (!inviteLink || !user) return;
    const myLevel = calculateLevel(user.points);
    const isRestricted = inviteLink.includes('restricted'); 
    const text = `♟️ *中国象棋对战邀请*\n\n👤 发起人: ${user.username}\n🏆 等级: Lv.${myLevel}\n${isRestricted ? '🔒 限制: 实力相当' : '⚔️ 限制: 无门槛'}\n\n点击下方链接，直接进入游戏对战 👇`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;
    if (WebApp && WebApp.openTelegramLink) {
        WebApp.openTelegramLink(shareUrl);
    } else {
        window.open(shareUrl, '_blank');
    }
  };

  const level = user ? calculateLevel(user.points) : 0;

  if (loading) {
      return (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] text-[#5c4033] font-sans wood-texture">
              <div className="w-16 h-16 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-bold text-lg animate-pulse">正在连接服务器...</p>
          </div>
      );
  }

  if (errorMsg) {
      return (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] text-[#5c4033] font-sans wood-texture p-6 text-center">
              <div className="bg-red-100 border-2 border-red-500 text-red-700 p-4 rounded-lg shadow-lg mb-6">
                  <h3 className="font-bold text-xl mb-2">连接失败</h3>
                  <p className="text-sm break-all">{errorMsg}</p>
              </div>
              <button 
                  onClick={initUser}
                  className="bg-[#8B0000] text-[#f0dbb0] px-6 py-3 rounded-lg font-bold shadow-lg active:scale-95 transition"
              >
                  重试
              </button>
          </div>
      );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#f0dbb0] text-[#4a3b2a] font-sans wood-texture relative">
      
      {/* Top Bar */}
      <div className="w-full p-4 flex justify-between items-start">
        {/* Sign In */}
        <button 
          className={`flex flex-col items-center space-y-1 transition-transform ${isSigningIn ? 'opacity-70' : 'active:scale-95'}`}
          onClick={handleSignIn}
        >
          <div className="w-10 h-10 bg-[#8B0000] rounded-full flex items-center justify-center text-white shadow-lg border-2 border-[#d4b483]">
            {isSigningIn ? (
               <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                </svg>
            )}
          </div>
          <span className="text-xs font-bold text-[#5c4033]">签到 +50</span>
        </button>

        {/* Center Info */}
        <div className="flex flex-col items-center">
            {/* Level Badge */}
            <div className="bg-[#8B0000] text-[#f0dbb0] text-xs font-bold px-2 py-0.5 rounded-t-lg border-x border-t border-[#d4b483]">
                Lv.{level} 棋士
            </div>
            
            {/* Points Capsule */}
            <div className="flex items-center bg-[#5c4033] rounded-full p-1 pr-1 gap-2 shadow-lg border border-[#8B0000]">
                <div className="flex items-center space-x-1 px-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-400">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM9 7.5A.75.75 0 019.75 6.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 019 7.5zm0 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM9 15a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 019 15z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[#d4b483] font-bold text-sm min-w-[30px] text-center">
                      {user ? user.points : 0}
                    </span>
                </div>

                {/* Buy Button */}
                <button 
                    onClick={handleOpenBuyModal}
                    disabled={isBuying}
                    className="bg-[#d4b483] hover:bg-[#c2a372] text-[#5c4033] rounded-full p-1 w-6 h-6 flex items-center justify-center transition-colors"
                >
                    {isBuying ? (
                        <div className="w-3 h-3 border-2 border-[#5c4033] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    )}
                </button>
            </div>
            <span className="text-[10px] mt-1 text-[#5c4033] font-bold opacity-70">1星 = 500分</span>
        </div>

        {/* Group */}
        <button 
          className="flex flex-col items-center space-y-1 active:scale-95 transition-transform"
          onClick={handleJoinGroup}
        >
          <div className="w-10 h-10 bg-[#4a6b8a] rounded-full flex items-center justify-center text-white shadow-lg border-2 border-[#d4b483]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-[#5c4033]">棋友群</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        
        {/* Title */}
        <div className="text-center mb-4">
            <h1 className="text-5xl font-extrabold text-[#5c4033] drop-shadow-md tracking-widest font-serif">中国象棋</h1>
            <p className="text-[#8B0000] mt-2 font-semibold tracking-wide text-opacity-80">-- 弘扬国粹，以棋会友 --</p>
            <p className="text-xs text-[#5c4033] opacity-60 mt-1">对局需 30 积分 | 胜+25 负-30</p>
        </div>

        {/* Buttons */}
        <div className="w-full max-w-sm space-y-5">
            {/* PvE Button */}
            <button 
                onClick={handleStartPvE}
                className="w-full bg-gradient-to-r from-[#8B0000] to-[#a52a2a] text-[#f0dbb0] p-6 rounded-2xl shadow-xl flex items-center justify-between hover:scale-105 transition-transform duration-200 border-2 border-[#5c4033]"
            >
                <div className="flex flex-col items-start">
                    <span className="text-2xl font-bold">人机对战</span>
                    <span className="text-sm opacity-80 mt-1">挑战 Gemini AI 大师</span>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                    </svg>
                </div>
            </button>

            {/* PvP Button */}
            <button 
                onClick={handlePvPClick}
                className="w-full bg-gradient-to-r from-[#5c4033] to-[#6d4c41] text-[#f0dbb0] p-6 rounded-2xl shadow-xl flex items-center justify-between hover:scale-105 transition-transform duration-200 border-2 border-[#3e2723]"
            >
                <div className="flex flex-col items-start">
                    <span className="text-2xl font-bold">棋友约战</span>
                    <span className="text-sm opacity-80 mt-1">邀请好友/双人对弈</span>
                </div>
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                </div>
            </button>
        </div>
      </div>
      
      {/* Footer Decoration */}
      <div className="w-full h-4 bg-[#5c4033] mt-auto"></div>

      {/* Buy Points Modal */}
      {showBuyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#f0dbb0] w-full max-w-sm rounded-xl border-4 border-[#5c4033] shadow-2xl p-6 relative">
                <button 
                  onClick={() => setShowBuyModal(false)}
                  className="absolute top-2 right-2 text-[#5c4033] hover:bg-[#d4b483] rounded-full p-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <h2 className="text-2xl font-bold text-[#5c4033] mb-4 text-center border-b border-[#5c4033] pb-2">购买积分</h2>
                
                <div className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-[#5c4033]">输入星星数量 (Stars)</label>
                        <input 
                            type="number" 
                            min="1"
                            value={buyAmount}
                            onChange={(e) => setBuyAmount(e.target.value)}
                            className="w-full p-3 rounded border-2 border-[#5c4033] bg-white text-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#8B0000]"
                            placeholder="例如: 50"
                        />
                    </div>
                    
                    <div className="bg-[#5c4033] text-[#f0dbb0] p-3 rounded flex justify-between items-center">
                        <span>可获得积分:</span>
                        <span className="text-xl font-bold">{(parseInt(buyAmount) || 0) * 500}</span>
                    </div>

                    <button 
                        onClick={handleConfirmBuy}
                        disabled={isBuying || !buyAmount || parseInt(buyAmount) <= 0}
                        className="w-full bg-[#8B0000] text-white py-3 rounded-lg font-bold text-lg hover:bg-red-900 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center"
                    >
                         {isBuying ? (
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                         ) : (
                             "确认支付"
                         )}
                    </button>
                    <p className="text-xs text-center text-[#5c4033] opacity-70">
                       1 Star = 500 积分
                    </p>
                </div>
            </div>
        </div>
      )}

      {/* PvP Matchmaking Modal */}
      {showPvPModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
            <div className="bg-[#f0dbb0] w-full max-w-sm rounded-xl border-4 border-[#5c4033] shadow-2xl p-6 relative">
                <button 
                  onClick={() => setShowPvPModal(false)}
                  className="absolute top-2 right-2 text-[#5c4033] hover:bg-[#d4b483] rounded-full p-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <h2 className="text-2xl font-bold text-[#5c4033] mb-4 text-center border-b border-[#5c4033] pb-2">约战模式选择</h2>
                
                {!inviteLink ? (
                  <div className="space-y-4">
                      <button 
                          onClick={() => startPvP(false)}
                          disabled={isCreatingGame}
                          className="w-full bg-[#5c4033] text-[#f0dbb0] p-4 rounded-lg flex flex-col items-center hover:bg-[#4a3627] transition"
                      >
                          <span className="text-lg font-bold">无限制匹配</span>
                          <span className="text-xs opacity-80">创建房间并获取邀请链接</span>
                      </button>

                      <button 
                          onClick={() => startPvP(true)}
                          disabled={isCreatingGame}
                          className="w-full bg-[#8B0000] text-[#f0dbb0] p-4 rounded-lg flex flex-col items-center hover:bg-[#700000] transition border-2 border-transparent hover:border-[#d4b483]"
                      >
                          <span className="text-lg font-bold">棋力匹配 (Lv.{Math.max(0, level - 1)}+)</span>
                          <span className="text-xs opacity-80">限制等级，获取专属链接</span>
                      </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-4 animate-fade-in">
                      <div className="bg-[#5c4033] text-[#f0dbb0] p-4 rounded-full">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                         </svg>
                      </div>
                      <h3 className="text-xl font-bold text-[#5c4033]">房间已创建!</h3>
                      <p className="text-sm text-center opacity-80 mb-2">发送链接给好友，点击即可开始对局</p>
                      
                      <button 
                        onClick={shareInvite}
                        className="w-full bg-[#8B0000] text-white py-3 rounded-lg font-bold shadow-lg animate-pulse"
                      >
                        发送邀请给 Telegram 好友
                      </button>

                      <div className="w-full bg-white bg-opacity-50 p-2 rounded text-xs break-all font-mono select-all border border-[#5c4033]">
                         {inviteLink}
                      </div>

                      <button 
                         onClick={() => onStartGame('pvp')}
                         className="text-sm underline text-[#5c4033] mt-2"
                      >
                        直接进入房间等待
                      </button>
                  </div>
                )}
                
                <p className="text-center text-xs text-[#5c4033] mt-4 opacity-70">
                    当前等级: Lv.{level}
                </p>
            </div>
        </div>
      )}
    </div>
  );
};
