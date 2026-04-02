'use client';

import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#08080d]">
          <div className="max-w-md px-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
              <AlertTriangle size={24} className="text-rose-400" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-white/80">Something went wrong</h2>
            <p className="mb-1 text-[12px] leading-relaxed text-white/35">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <p className="mb-6 text-[11px] text-white/35">
              Your workflow data is safe in local storage.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/15 px-5 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
            >
              <RefreshCw size={14} />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
