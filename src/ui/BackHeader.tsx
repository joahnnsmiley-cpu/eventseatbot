import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { UI_TEXT } from '../../constants/uiText';

type BackHeaderProps = {
  onBack: () => void;
  /** Optional title (e.g. screen name) */
  title?: string;
  /** Optional right-side content */
  right?: React.ReactNode;
  /** Dark theme (profile) vs light */
  variant?: 'dark' | 'light';
  /** Override back button label (default: UI_TEXT.app.back) */
  backLabel?: string;
};

export default function BackHeader({ onBack, title, right, variant = 'dark', backLabel }: BackHeaderProps) {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#EAE6DD' : '#1C1C1C';
  const mutedColor = isDark ? '#9B948A' : '#6E6A64';

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-3 py-3 px-1 -mx-1 mb-2"
      style={{
        background: isDark ? 'linear-gradient(to bottom, rgba(15,15,15,0.95) 0%, transparent 100%)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium rounded-lg px-2 py-1.5 -ml-1 transition-colors hover:opacity-80 active:scale-[0.98]"
        style={{ color: textColor }}
        aria-label={backLabel ?? UI_TEXT.app.back}
      >
        <ChevronLeft size={20} strokeWidth={2} />
        {backLabel ?? UI_TEXT.app.back}
      </button>
      {title && (
        <span className="flex-1 text-center text-sm font-medium truncate" style={{ color: mutedColor }}>
          {title}
        </span>
      )}
      <div className="flex items-center justify-end min-w-[72px]">{right}</div>
    </header>
  );
}
