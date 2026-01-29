
import React, { useState } from 'react';
import { User } from '../types.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void; // 支付成功后的回调（如刷新用户信息）
}

export const PaymentModal: React.FC<Props> = ({ isOpen, onClose, user, onSuccess }) => {
  const [buyAmount, setBuyAmount] = useState<string>('50');
  const [isBuying, setIsBuying] = useState(false);

  // @ts-ignore
  const WebApp = window.Telegram?.WebApp;

  const safeAlert = (msg: string) => {
    if (WebApp?.showAlert) {
       WebApp.showAlert(msg);
    } else {
       alert(msg);
    }
  };

  const handleConfirmBuy = async () => {
    const starsToBuy = parseInt(buyAmount);
    if (!starsToBuy || starsToBuy <= 0) {
        safeAlert("请输入有效的星星数量（正整数）。");
        return;
    }
    
    if (isBuying || !user) return;
    setIsBuying(true);

    try {
        const invoiceRes = await fetch('/api/create_invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: user.telegram_id, stars: starsToBuy })
        });
        
        const invoiceData = await invoiceRes.json();
        
        if (!invoiceData.success) {
            safeAlert(`订单创建失败: ${invoiceData.error || "机器人配置错误"}`);
            setIsBuying(false);
            return;
        }

        const invoiceLink = invoiceData.invoice_link;
        
        // 关闭弹窗，准备支付
        onClose();

        // 核心支付逻辑
        if (WebApp?.openInvoice) {
            WebApp.openInvoice(invoiceLink, async (status: string) => {
                setIsBuying(false);
                if (status === 'paid') {
                    safeAlert("✅ 支付请求已成功！\n系统正在处理积分到账，请在 3-5 秒后刷新账户余额。");
                    // 延迟调用成功回调，给后端一点处理时间
                    setTimeout(onSuccess, 3500);
                } else if (status === 'failed' || status === 'error') {
                    safeAlert("⚠️ 原生支付失败。\n请点击下方链接手动支付。");
                    if (WebApp?.openTelegramLink) WebApp.openTelegramLink(invoiceLink);
                    else window.open(invoiceLink, '_blank');
                }
            });
        } else {
            // 降级处理
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
        <div className="bg-[#f0dbb0] w-full max-w-sm rounded-3xl border-4 border-[#5c4033] p-8 relative shadow-2xl animate-in zoom-in duration-200">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-black/10 rounded-full transition">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#5c4033]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-3xl font-black text-center text-[#5c4033] border-b-2 border-[#5c4033] pb-4 mb-6">积分充值</h2>
            <div className="space-y-6">
                <div className="flex flex-col space-y-2">
                    <label className="text-sm font-black text-[#5c4033] ml-1">充值 Stars 数量 (1⭐ = 500积分)</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={buyAmount} 
                      onChange={(e) => setBuyAmount(e.target.value)} 
                      className="w-full p-4 rounded-2xl border-2 border-[#5c4033] font-mono text-xl focus:outline-none focus:ring-4 ring-[#8B0000]/20 bg-white/50" 
                    />
                </div>
                <div className="p-4 bg-[#5c4033]/5 rounded-2xl border border-[#5c4033]/10">
                    <p className="text-sm text-center">您将获得：<span className="text-2xl font-black text-[#8B0000]">{(parseInt(buyAmount)||0)*500}</span> 积分</p>
                </div>
                <button 
                  onClick={handleConfirmBuy} 
                  disabled={isBuying} 
                  className="w-full bg-gradient-to-r from-[#8B0000] to-[#600000] text-white py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition flex items-center justify-center gap-3 disabled:opacity-70"
                >
                    {isBuying ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : "立即支付"}
                </button>
                <p className="text-center text-[10px] text-[#5c4033] opacity-60">充值通过 Telegram Stars 安全处理</p>
            </div>
        </div>
    </div>
  );
};
