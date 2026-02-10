import React from 'react';
import { UI_TEXT } from '../constants/uiText';

type ErrorBoundaryState = {
  error: Error | null;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h1>{UI_TEXT.common.somethingWentWrong}</h1>
          <div>{UI_TEXT.common.refreshPageAndRetry}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
