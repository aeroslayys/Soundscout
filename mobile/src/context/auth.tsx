import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
const TOKEN_KEY = 'soundscout.auth.token';
type AuthValue = { token: string; ready: boolean; setToken: (token: string) => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(TOKEN_KEY).then(saved => { if (active && saved) setTokenState(saved); })
      .catch(error => console.warn('Could not restore SoundScout session:', error))
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const setToken = async (next: string) => { await SecureStore.setItemAsync(TOKEN_KEY, next); setTokenState(next); };
  const signOut = async () => { await SecureStore.deleteItemAsync(TOKEN_KEY); setTokenState(''); };
  const value = useMemo(() => ({ token, ready, setToken, signOut }), [token, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}