'use client';

import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';
import AuthGate from './AuthGate';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  activateSupabaseBackend,
  activateLocalBackend,
  migrateLocalToSupabase,
} from '@/lib/storage';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// ── Auth context ────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current user, or null if anonymous / not signed in */
  user: SupabaseUser | null;
  /** True if using Supabase cloud storage, false if localStorage only */
  isCloud: boolean;
  /** True while checking initial auth state */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isCloud: false,
  loading: true,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ── Provider component ──────────────────────────────────────────────────────

export default function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // When Supabase is not configured, resolve immediately
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthResolved(true);
    }
  }, []);

  const handleAuth = useCallback((u: SupabaseUser | null) => {
    setUser(u);
    setAuthResolved(true);
    setDismissed(true);

    // Activate appropriate storage backend
    if (u) {
      activateSupabaseBackend(u.id);
      // Migrate local projects to Supabase on first sign-in (background, non-blocking)
      void migrateLocalToSupabase();
    } else {
      activateLocalBackend();
    }
  }, []);

  const isCloud = isSupabaseConfigured() && user !== null;

  return (
    <AuthContext.Provider value={{ user, isCloud, loading: !authResolved }}>
      {/* Show AuthGate overlay when Supabase is configured and user hasn't chosen yet */}
      {isSupabaseConfigured() && !dismissed && <AuthGate onAuth={handleAuth} />}
      {children}
    </AuthContext.Provider>
  );
}
