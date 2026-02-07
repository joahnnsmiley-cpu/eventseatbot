import React from 'react';

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
          <h1>Ошибка приложения</h1>
          <div>{this.state.error.message}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
