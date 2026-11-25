import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-6 text-center">
            <div className="text-xs font-mono text-[#858585] uppercase tracking-wider">
              Component Error
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-white">
              This section encountered an error
            </h3>
            <p className="text-xs text-[#555555] mt-2 max-w-md mx-auto">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="mt-4 flex items-center gap-1.5 border border-[#262626] px-4 py-2 text-xs text-white hover:border-white"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Try Again</span>
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
