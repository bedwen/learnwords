import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export function ErrorFallback() {
  return (
    <div className="bg-background py-16 flex items-center justify-center">
      <div
        role="alert"
        className="bg-card border border-surface-200 rounded-xl shadow-sm p-8 max-w-md w-full text-center space-y-4 transition-colors duration-200"
      >
        <h2 className="text-xl font-semibold text-surface-900">Something went wrong</h2>
        <p className="text-sm text-surface-600">
          An unexpected error occurred while displaying this page. Your saved words and study progress are safe.
          You can reload the application or return to the dashboard.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
          <Button onClick={() => window.location.reload()}>Reload Application</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
