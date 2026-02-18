import React, { useState } from 'react';

const PREMIUM_HIDE_KEY = 'premium_hide';

type Props = {
  message: string;
  onClose: () => void;
};

export default function PremiumGreetingModal({ message, onClose }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleCheckboxChange = (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) {
      try {
        localStorage.setItem(PREMIUM_HIDE_KEY, 'true');
      } catch {}
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md rounded-2xl border border-[#C6A75E]/40 bg-[#0f0f0f] p-6 shadow-[0_0_40px_rgba(198,167,94,0.15)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-title"
      >
        <h2 id="premium-modal-title" className="text-center text-lg font-semibold text-[#C6A75E] mb-4">
          С любовью
        </h2>
        <div
          className="text-center text-white/90 leading-relaxed whitespace-pre-line mb-6"
          style={{ lineHeight: 1.7 }}
        >
          {message}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => handleCheckboxChange(e.target.checked)}
            className="rounded border-white/30"
          />
          Больше не показывать
        </label>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-[#C6A75E]/50 text-[#C6A75E] hover:bg-[#C6A75E]/10 transition"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

export { PREMIUM_HIDE_KEY };
