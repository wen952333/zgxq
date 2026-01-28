
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
  
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyAmount, setBuyAmount] = useState<string>('50');
  const [isBuying, setIsBuying] = useState(false);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  
  const [config, setConfig] = useState({
      groupUrl: DEFAULT_TELEGRAM_GROUP_URL,
      botAppUrl: DEFAULT_TELEGRAM_BOT_APP_URL
  });

  const initUser = async () => {
      setLoading(true);
      setErrorMsg(null);

      // @ts-ignore
      const WebApp = window.Telegram?.WebApp;
      WebApp?.ready();
      WebApp?.expand();

      const tgUser = WebApp?.initDataUnsafe?.user;
      const telegram_id = tgUser?.id?.toString() || "dev_user_123";
      const username = tgUser?.username || "DevPlayer";

      try {
        // 使用 try-catch 包装 fetch，防止 404 或网络错误阻断应用
        const [userRes, configRes] = await Promise.all([
             fetch(`/api/user?telegram_id=${telegram_id}&username=${username}`).catch(() => ({ ok: false, status: 404 } as Response)),
             fetch('/api/config').catch(() => ({ ok: false } as any))
        ]);

        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        } else {
          // ================= 核心修复：404 容错 (访客模式) =================
          console.warn(`API 返回 ${userRes.status}，启用访客模式`);
          setUser({
            id: 0,
            telegram_id: telegram_id,
            username: `${username} (访客)`,
            points: 1000 // 赋予初始积分以便测试
          });
          
          if (userRes.status !== 404) {
            WebApp?.showAlert?.(`服务器连接异常 (${userRes.status})，已切换至访客模式。`);
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
        console.error("Init Error:", error);
        setUser({ id: 0, telegram_id, username, points: 500 });
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    initUser();
  }, []);

  const safeAlert = (msg: string) => {
      // @ts-ignore
      const WebApp = window.Telegram?.WebApp;
      if (WebApp?.showAlert) {
         WebApp.showAlert(msg);
      } else {
         alert(msg);
      }
  };

  const handleConfirmBuy = async () => {
    const starsToBuy = parseInt(buyAmount);
    if (!starsToBuy || starsToBuy <= 0) {
        safeAlert("请输入有效的星星数量");
        return;
    }
    
    if (isBuying) return;
    setIsBuying(true);
    
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;

    try {
        const invoiceRes = await fetch('/api/create_invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: user!.telegram_id, stars: starsToBuy })
        });
        
        const invoiceData = await invoiceRes.json();
        
        if (!invoiceData.success) {
            safeAlert("创建订单失败: " + (invoiceData.error || "未知错误"));
            setIsBuying(false);
            return;
        }

        const invoiceLink = invoiceData.invoice_link;
        setShowBuyModal(false);

        // 调用原生支付控件
        WebApp.openInvoice(invoiceLink, async (status: string) => {
            setIsBuying(false);
            if (status === 'paid') {
                const creditRes = await fetch('/api/buy_points', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegram_id: user!.telegram_id, stars: starsToBuy })
                });
                const creditData = await creditRes.json();
                if (creditData.success) {
                    setUser(prev => prev ? { ...prev, points: creditData.points } : null);
                    safeAlert(`支付成功！已充值 ${starsToBuy * 500} 积分。`);
                }
            } else if (status === 'failed') {
                // ================= 核心修复：支付失败明确提示并降级 =================
                safeAlert("原生支付控件调起失败。请尝试点击链接手动支付。");
                setTimeout(() => {
                    WebApp.openTelegramLink(invoiceLink);
                }, 800);
            }
        });

    } catch (e) {
        safeAlert("支付系统通信异常");
        setIsBuying(false);
    }
  };

  // 其余逻辑保持不变...
  const handleSignIn = async () => {
    if (!user || user.id === 0) { safeAlert("访客模式无法签到，请确保网络正常。"); return; }
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
          safeAlert(data.message || "签到失败");
      }
    } catch (e) { safeAlert("网络错误"); } finally { setIsSigningIn(false); }
  };

  const handleJoinGroup = () => {
    const url = config.groupUrl;
    // @ts-ignore
    const WebApp = window.Telegram?.WebApp;
    WebApp?.openTelegramLink ? WebApp.openTelegramLink(url) : window.open(url, '_blank');
  };

  if (loading) return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f0dbb0] wood-texture">
        <div className="w-12 h-12 border-4 border-[#8B0000] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-[#5c4033]">正在连接大厅...</p>
    </div>
  );

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#f0dbb0] text-[#4a3b2a] font-sans wood-texture relative">
      <div className="w-full p-4 flex justify-between items-start">
        <button onClick={handleSignIn} className="flex flex-col items-center space-y-1">
          <div className="w-10 h-10 bg-[#8B0000] rounded-full flex items-center justify-center text-white shadow-lg border-2 border-[#d4b483]">
            {isSigningIn ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "签"}
          </div>
          <span className="text-xs font-bold">签到</span>
        </button>

        <div className="flex flex-col items-center">
            <div className="bg-[#8B0000] text-white text-[10px] px-2 py-0.5 rounded-t-lg border-x border-t border-[#d4b483]">
                {user?.id === 0 ? '访客模式' : `Lv.${Math.floor((user?.points||0)/1000)} 棋士`}
            </div>
            <div className="flex items-center bg-[#5c4033] rounded-full p-1 pr-1 gap-2 border border-[#8B0000]">
                <div className="flex items-center space-x-1 px-2">
                    <span className="text-yellow-400">🪙</span>
                    <span className="text-[#d4b483] font-bold text-sm">{user?.points || 0}</span>
                </div>
                <button onClick={() => user?.id !== 0 && setShowBuyModal(true)} className="bg-[#d4b483] text-[#5c4033] rounded-full w-6 h-6 flex items-center justify-center font-bold">+</button>
            </div>
        </div>

        <button onClick={handleJoinGroup} className="flex flex-col items-center space-y-1">
          <div className="w-10 h-10 bg-[#4a6b8a] rounded-full flex items-center justify-center text-white shadow-lg border-2 border-[#d4b483]">群</div>
          <span className="text-xs font-bold">棋友群</span>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        <div className="text-center">
            <h1 className="text-5xl font-extrabold text-[#5c4033] tracking-widest font-serif drop-shadow-md">中国象棋</h1>
            <p className="text-[#8B0000] mt-2 font-semibold italic">-- Gemini 3 Pro AI 驱动 --</p>
        </div>

        <div className="w-full max-w-sm space-y-5">
            <button onClick={() => user?.points! >= 30 ? onStartGame('pve') : safeAlert("积分不足 30")} className="w-full bg-gradient-to-r from-[#8B0000] to-[#a52a2a] text-[#f0dbb0] p-6 rounded-2xl shadow-xl flex items-center justify-between border-2 border-[#5c4033]">
                <div className="text-left"><span className="text-2xl font-bold block">人机对战</span><span className="text-xs opacity-80">挑战最强 AI 大师</span></div>
                <div className="text-3xl">🤖</div>
            </button>

            <button disabled={user?.id === 0} onClick={() => setShowPvPModal(true)} className={`w-full bg-gradient-to-r from-[#5c4033] to-[#6d4c41] text-[#f0dbb0] p-6 rounded-2xl shadow-xl flex items-center justify-between border-2 border-[#3e2723] ${user?.id === 0 ? 'opacity-50' : ''}`}>
                <div className="text-left"><span className="text-2xl font-bold block">棋友约战</span><span className="text-xs opacity-80">邀请好友 实时对弈</span></div>
                <div className="text-3xl">⚔️</div>
            </button>
        </div>
      </div>

      {showBuyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#f0dbb0] w-full max-w-sm rounded-xl border-4 border-[#5c4033] p-6 relative">
                <button onClick={() => setShowBuyModal(false)} className="absolute top-2 right-2 p-1">✕</button>
                <h2 className="text-xl font-bold text-center border-b border-[#5c4033] pb-2 mb-4">购买积分</h2>
                <div className="space-y-4">
                    <div className="flex flex-col space-y-1">
                        <label className="text-sm font-bold">星星数量 (1⭐ = 500积分)</label>
                        <input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="w-full p-2 rounded border-2 border-[#5c4033] font-mono" />
                    </div>
                    <button onClick={handleConfirmBuy} disabled={isBuying} className="w-full bg-[#8B0000] text-white py-3 rounded-lg font-bold shadow-lg">
                        {isBuying ? "正在调起支付..." : `支付 ${buyAmount} 星星`}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
