'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, KeyRound, Chrome, UserX, Loader2, LogOut, User } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

type AuthView = 'options' | 'email-login' | 'magic-link' | 'check-email';

interface AuthGateProps {
  /** Called when auth state resolves (user or null for anonymous) */
  onAuth: (user: SupabaseUser | null) => void;
  /** If true, show inline user badge instead of full gate */
  inline?: boolean;
}

/**
 * AuthGate — sign-in UI with email/password, magic link, Google OAuth, and anonymous fallback.
 * When Supabase is not configured, auto-falls back to anonymous mode.
 */
export default function AuthGate({ onAuth, inline }: AuthGateProps) {
  const [view, setView] = useState<AuthView>('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  // On mount: check for existing session
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setInitializing(false);
      onAuth(null);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setInitializing(false);
      onAuth(null);
      return;
    }

    // Check existing session
    client.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setInitializing(false);
      onAuth(u);
    });

    // Listen for auth changes (magic link callback, sign out, etc.)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      onAuth(u);
    });

    return () => subscription.unsubscribe();
  }, [onAuth]);

  const handleEmailLogin = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !email) return;
    setLoading(true);
    setError('');

    const { error: err } = await client.auth.signInWithPassword({ email, password });
    if (err) {
      // If sign-in fails, try sign-up
      if (err.message.includes('Invalid login')) {
        const { error: signUpErr } = await client.auth.signUp({ email, password });
        if (signUpErr) {
          setError(signUpErr.message);
        }
        // signUp may require email confirmation — handled by auth state listener
      } else {
        setError(err.message);
      }
    }
    setLoading(false);
  }, [email, password]);

  const handleMagicLink = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !email) return;
    setLoading(true);
    setError('');

    const { error: err } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });

    if (err) {
      setError(err.message);
    } else {
      setView('check-email');
    }
    setLoading(false);
  }, [email]);

  const handleGoogleOAuth = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setLoading(true);
    setError('');

    const { error: err } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });

    if (err) {
      setError(err.message);
      setLoading(false);
    }
    // OAuth redirects away — loading state stays until redirect
  }, []);

  const handleAnonymous = useCallback(() => {
    onAuth(null);
  }, [onAuth]);

  const handleSignOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    setUser(null);
    setShowMenu(false);
    onAuth(null);
  }, [onAuth]);

  // ── Inline user badge (for TopBar) ──────────────────────────────────────
  if (inline) {
    if (!isSupabaseConfigured() || !user) {
      return (
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Not signed in — using local storage"
        >
          <UserX size={14} />
          <span>Local</span>
        </button>
      );
    }

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-emerald-400 hover:bg-zinc-800 transition-colors"
          title={user.email ?? 'Signed in'}
        >
          <User size={14} />
          <span className="max-w-[100px] truncate">{user.email?.split('@')[0] ?? 'User'}</span>
        </button>
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 z-50 min-w-[140px]"
            >
              <div className="px-2 py-1 text-xs text-zinc-400 truncate">{user.email}</div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-red-400 hover:bg-zinc-800 rounded transition-colors"
              >
                <LogOut size={12} />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  // ── Already signed in ───────────────────────────────────────────────────
  if (user) return null;

  // ── Not configured — skip auth entirely ─────────────────────────────────
  if (!isSupabaseConfigured()) return null;

  // ── Full auth gate UI ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4"
      >
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Sign in to Lifecycle</h2>
        <p className="text-xs text-zinc-500 mb-5">Save your workflows to the cloud, or continue locally.</p>

        <AnimatePresence mode="wait">
          {view === 'options' && (
            <motion.div
              key="options"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <button
                onClick={() => setView('email-login')}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-sm text-zinc-200 transition-colors"
              >
                <Mail size={16} />
                Continue with email
              </button>
              <button
                onClick={() => setView('magic-link')}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-sm text-zinc-200 transition-colors"
              >
                <KeyRound size={16} />
                Magic link (no password)
              </button>
              <button
                onClick={handleGoogleOAuth}
                disabled={loading}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-sm text-zinc-200 transition-colors disabled:opacity-50"
              >
                <Chrome size={16} />
                Continue with Google
              </button>
              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-zinc-900 px-2 text-zinc-600">or</span>
                </div>
              </div>
              <button
                onClick={handleAnonymous}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg border border-zinc-800 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
              >
                <UserX size={16} />
                Continue without account (local only)
              </button>
            </motion.div>
          )}

          {view === 'email-login' && (
            <motion.div
              key="email-login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-600"
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-600"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleEmailLogin}
                disabled={loading || !email || !password}
                className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="animate-spin" size={14} />}
                Sign in / Sign up
              </button>
              <button
                onClick={() => { setView('options'); setError(''); }}
                className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
              >
                Back to options
              </button>
            </motion.div>
          )}

          {view === 'magic-link' && (
            <motion.div
              key="magic-link"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-600"
                autoFocus
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleMagicLink}
                disabled={loading || !email}
                className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="animate-spin" size={14} />}
                Send magic link
              </button>
              <button
                onClick={() => { setView('options'); setError(''); }}
                className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
              >
                Back to options
              </button>
            </motion.div>
          )}

          {view === 'check-email' && (
            <motion.div
              key="check-email"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-4"
            >
              <Mail className="mx-auto text-emerald-400 mb-3" size={32} />
              <p className="text-sm text-zinc-200 mb-1">Check your email</p>
              <p className="text-xs text-zinc-500 mb-4">
                We sent a sign-in link to <strong className="text-zinc-300">{email}</strong>
              </p>
              <button
                onClick={() => setView('options')}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Back to options
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
