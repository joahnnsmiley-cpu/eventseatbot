import React, { useState } from 'react';
import PrivacyPolicyScreen from './PrivacyPolicyScreen';
import UserAgreementScreen from './UserAgreementScreen';

export const PRIVACY_CONSENT_KEY = 'eventseatbot_privacy_v1';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
};

export default function PrivacyConsentModal({ onAccept, onDecline }: Props) {
  const [checked, setChecked] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  if (showPolicy) {
    return <PrivacyPolicyScreen onBack={() => setShowPolicy(false)} />;
  }

  if (showAgreement) {
    return <UserAgreementScreen onBack={() => setShowAgreement(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0b0b]">
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center">
            <div className="text-4xl mb-2">🔒</div>
            <h1 className="text-xl font-bold text-white">Обработка персональных данных</h1>
            <p className="text-sm text-white/60 leading-relaxed">
              Для оформления бронирования сервис запрашивает контактный номер телефона и использует
              идентификатор вашего аккаунта.
            </p>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl p-4 space-y-2 text-sm text-white/70">
            <p className="font-medium text-white/90">Что обрабатывается:</p>
            <ul className="space-y-1 list-none">
              <li className="flex items-start gap-2">
                <span className="text-[#C6A75E] mt-0.5">•</span>
                Номер телефона (вводится при бронировании)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C6A75E] mt-0.5">•</span>
                ID аккаунта Telegram / VK
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C6A75E] mt-0.5">•</span>
                Комментарий к бронированию (по желанию)
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 transition flex items-center justify-center ${
                  checked
                    ? 'bg-[#C6A75E] border-[#C6A75E]'
                    : 'border-white/30 bg-transparent group-hover:border-white/50'
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 10 8" className="w-3 h-3 text-black fill-none stroke-current stroke-2">
                    <polyline points="1,4 4,7 9,1" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-white/70 leading-relaxed">
              Я ознакомился(-ась) с{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowAgreement(true); }}
                className="text-[#C6A75E] underline underline-offset-2 hover:text-[#d4b86c] transition"
              >
                пользовательским соглашением
              </button>{' '}
              и{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowPolicy(true); }}
                className="text-[#C6A75E] underline underline-offset-2 hover:text-[#d4b86c] transition"
              >
                политикой конфиденциальности
              </button>
              , даю согласие на обработку персональных данных.
            </span>
          </label>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-3 w-full max-w-sm mx-auto">
        <button
          type="button"
          onClick={onAccept}
          disabled={!checked}
          className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition ${
            checked
              ? 'bg-[#C6A75E] text-black hover:bg-[#d4b86c] active:bg-[#b09450]'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          Продолжить
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="w-full py-2.5 rounded-2xl text-sm text-white/40 hover:text-white/60 transition"
        >
          Отказаться
        </button>
      </div>
    </div>
  );
}
