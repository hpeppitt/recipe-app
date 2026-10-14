import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reportError } from '../../services/telemetry';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  /** When this changes the boundary clears, so one broken page does not poison navigation. */
  resetKey?: string;
  onBack: () => void;
}

interface State {
  failed: boolean;
}

/** Must be a class: React has no hook for catching render errors. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack);
    reportError(error, 'error-boundary');
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        icon="😵"
        title="Something went wrong"
        description="This page failed to load. Your recipes are safe."
        action={
          <Button
            onClick={() => {
              this.setState({ failed: false });
              this.props.onBack();
            }}
          >
            Back to library
          </Button>
        }
      />
    );
  }
}

/** Router-aware wrapper: resets on navigation and sends "Back to library" home. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <ErrorBoundary resetKey={pathname} onBack={() => navigate('/')}>
      {children}
    </ErrorBoundary>
  );
}
