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
        <div className="flex items-center justify-center h-full w-full bg-[#08080d]">
          <div className="text-center max-w-md px-8">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={24} className="text-rose-400" />
            </div>
            <h2 className="text-lg font-semibold text-white/80 mb-2">Something went wrong</h2>
            <p className="text-[12px] text-white/35 leading-relaxed mb-1">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <p className="text-[11px] text-white/20 mb-6">Your workflow data is safe in local storage.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
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
