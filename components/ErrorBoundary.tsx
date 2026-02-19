import React from 'react';
import { UI_TEXT } from '../constants/uiText';
import { glass, glassFallback, radius, shadow, typography, spacing } from '../design/theme';

const GLASS_FALLBACK_STYLE = `
@supports not (backdrop-filter: blur(20px)) {
  .error-boundary-glass { background: ${glassFallback} !important; }
}
`;

type ErrorBoundaryState = {
  error: Error | null;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Кастомный fallback вместо стандартного «Что-то пошло не так» */
  fallback?: React.ReactNode;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <>
          <style>{GLASS_FALLBACK_STYLE}</style>
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing[5],
              background: '#0F0F0F',
            }}
          >
            <div
              className="error-boundary-glass"
              style={{
                background: 'rgba(26,26,26,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: shadow.elevated,
                borderRadius: radius.xl,
                padding: spacing[5],
                maxWidth: 400,
                textAlign: 'center',
              }}
            >
              <h1
                style={{
                  fontSize: typography.title,
                  fontWeight: 600,
                  color: '#F5F2EB',
                  margin: `0 0 ${spacing[2]}px`,
                }}
              >
                {UI_TEXT.common.somethingWentWrong}
              </h1>
              <p
                style={{
                  fontSize: typography.body,
                  color: '#9B948A',
                  margin: `0 0 ${spacing[5]}px`,
                  lineHeight: 1.5,
                }}
              >
                {UI_TEXT.common.refreshPageAndRetry}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: `${spacing[3]}px ${spacing[6]}px`,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#0F0F0F',
                  background: 'linear-gradient(135deg, #C6A75E, #E8D48A)',
                  border: 'none',
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s, transform 0.15s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Обновить
              </button>
            </div>
          </div>
        </>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
