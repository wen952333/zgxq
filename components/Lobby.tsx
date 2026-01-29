
import React, { useEffect, useState } from 'react';
import { User } from '../types.ts';
import { DEFAULT_TELEGRAM_GROUP_URL, DEFAULT_TELEGRAM_BOT_APP_URL } from '../constants.ts';

interface Props {
  onStartGame: (mode: 'pve' | 'pvp') => void;
}

export const Lobby: React.FC<Props> = ({ onStartGame }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // PvP 状态
  const [showPvPModal, setShowPvPModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  
  // 支付状态
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyAmount, setBuyAmount] = useState<string>('50');
  const [isBuying, setIsBuying] = useState(false);
  
  const [config, setConfig] = useState({
      groupUrl: DEFAULT_TELEGRAM_GROUP_URL,
      botAppUrl: DEFAULT_TELEGRAM_BOT_APP_URL
  });

  // 获取 Telegram WebApp 对象
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

  // --- 支付逻辑 ---
  const handleConfirmBuy = async () => {
    const starsToBuy = parseInt(buyAmount);
    if (!starsToBuy || starsToBuy <= 0) {
        safeAlert("请输入有效的星星数量（正整数）。");
        return;
    }
    
    if (isBuying) return;
    setIsBuying(true);

    try {
        const invoiceRes = await fetch('/api/create_invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: user!.telegram_id, stars: starsToBuy })
        });
        
        const invoiceData = await invoiceRes.json();
        
        if (!invoiceData.success) {
            safeAlert(`订单创建失败: ${invoiceData.error || "机器人 Token 配置可能存在问题。"}`);
            setIsBuying(false);
            return;
        }

        const invoiceLink = invoiceData.invoice_link;
        setShowBuyModal(false);

        if (WebApp?.openInvoice) {
            WebApp.openInvoice(invoiceLink, async (status: string) => {
                setIsBuying(false);
                if (status === 'paid') {
                    safeAlert("✅ 支付请求已成功！\n系统正在处理积分到账，请在 3-5 秒后刷新账户余额。");
                    setTimeout(initUser, 3500);
                } else if (status === 'failed' || status === 'error') {
                    safeAlert("⚠️ 原生支付失败。\n请点击下方链接手动支付。");
                    WebApp.openTelegramLink(invoiceLink);
                }
            });
        } else {
            if (WebApp?.openTelegramLink) {
                WebApp.openTelegramLink(invoiceLink);
            } else {
                window.open(invoiceLink, '_blank');
            }
            setIsBuying(false);
        }
    } catch (e) {
        safeAlert("网络异常，无法连接支付服务器。");
        setIsBuying(false);
    }
  };

  // --- PvP 约战逻辑 ---
  const handleCreatePvP = async () => {
      if (isCreatingGame) return;
      setIsCreatingGame(true);
      setInviteLink(null); // Reset

      try {
          const res = await fetch('/api/create_game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  telegram_id: user?.telegram_id,
                  min_level: 0 
              })
          });
          
          const data = await res.json();
          if (data.success) {
              // 构建深度链接: t.me/bot/app?startapp=game_ID
              const link = `${config.botAppUrl}?startapp=game_${data.game_id}`;
              setInviteLink(link);
          } else {
              safeAlert("创建房间失败: " + data.error);
          }
      } catch (e) {
          safeAlert("创建房间失败，网络错误。");
      } finally {
          setIsCreatingGame(false);
      }
  };

  const handleShareInvite = () => {
      if (!inviteLink) return;
      const text = "来局象棋？点击链接直接加入我的房间对战！";
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
      
      if (WebApp?.openTelegramLink) {
          WebApp.openTelegramLink(shareUrl);
      } else {
          window.open(shareUrl, '_blank');
      }
  };

  // --- 签到逻辑 ---
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
                <button onClick={() => user?.id !== 0 && setShowBuyModal(true)} className="bg-[#d4b483] text-[#5c4033] rounded-full w-7 h-7 flex items-center justify-center font-bold shadow-inner active:scale-110 transition">+</button>
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
              onClick={() => setShowPvPModal(true)} 
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

      {/* 充值弹窗 */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[#f0dbb0] w-full max-w-sm rounded-3xl border-4 border-[#5c4033] p-8 relative shadow-2xl animate-in zoom-in duration-200">
                <button onClick={() => setShowBuyModal(false)} className="absolute top-4 right-4 p-2 hover:bg-black/10 rounded-full transition">✕</button>
                <h2 className="text-3xl font-black text-center text-[#5c4033] border-b-2 border-[#5c4033] pb-4 mb-6">积分充值</h2>
                <div className="space-y-6">
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-black text-[#5c4033] ml-1">充值 Stars 数量 (1⭐ = 500积分)</label>
                        <input type="number" min="1" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="w-full p-4 rounded-2xl border-2 border-[#5c4033] font-mono text-xl" />
                    </div>
                    <div className="p-4 bg-[#5c4033]/5 rounded-2xl border border-[#5c4033]/10">
                        <p className="text-sm text-center">您将获得：<span className="text-2xl font-black text-[#8B0000]">{(parseInt(buyAmount)||0)*500}</span> 积分</p>
                    </div>
                    <button onClick={handleConfirmBuy} disabled={isBuying} className="w-full bg-gradient-to-r from-[#8B0000] to-[#600000] text-white py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3 disabled:opacity-70">
                        {isBuying ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : "立即支付"}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* PvP 约战弹窗 */}
      {showPvPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-[#f0dbb0] w-full max-w-sm rounded-3xl border-4 border-[#5c4033] p-8 relative shadow-2xl animate-in zoom-in duration-200">
                <button onClick={() => {setShowPvPModal(false); setInviteLink(null);}} className="absolute top-4 right-4 p-2 hover:bg-black/10 rounded-full transition">✕</button>
                <h2 className="text-3xl font-black text-center text-[#5c4033] border-b-2 border-[#5c4033] pb-4 mb-6">创建棋室</h2>
                
                {!inviteLink ? (
                    <div className="space-y-6 text-center">
                        <p className="text-[#5c4033] font-bold">准备好与好友一决高下了吗？</p>
                        <div className="text-6xl my-4">⚔️</div>
                        <button 
                            onClick={handleCreatePvP} 
                            disabled={isCreatingGame}
                            className="w-full bg-gradient-to-r from-[#5c4033] to-[#3e2b22] text-[#f0dbb0] py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3"
                        >
                            {isCreatingGame ? "正在创建..." : "生成邀请链接"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6 text-center animate-in slide-in-from-bottom-4 duration-300">
                        <div className="p-4 bg-green-100 border-2 border-green-500 rounded-xl">
                            <p className="text-green-800 font-bold">✅ 房间已创建</p>
                        </div>
                        <p className="text-xs text-[#5c4033] opacity-80 break-all select-all font-mono bg-white/50 p-2 rounded border border-[#5c4033]/20">
                            {inviteLink}
                        </p>
                        <button 
                            onClick={handleShareInvite} 
                            className="w-full bg-gradient-to-r from-[#0088cc] to-[#006699] text-white py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3"
                        >
                            <span>📤 发送给好友</span>
                        </button>
                        <p className="text-[10px] text-[#5c4033] opacity-60">好友点击链接即可直接进入房间</p>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* 底部纹理装饰 */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#8B0000] opacity-30"></div>
    </div>
  );
};
