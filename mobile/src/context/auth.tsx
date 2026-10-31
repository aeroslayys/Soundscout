import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
const TOKEN_KEY = 'soundscout.auth.token';
const USER_KEY = 'soundscout.auth.user';
export type SoundScoutUser = { id?: number | string; email?: string; name?: string; age?: number; sensitivity?: number; admin?: boolean };
type AuthValue = { token: string; user: SoundScoutUser | null; ready: boolean; setToken: (token: string, user?: SoundScoutUser | null) => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState('');
  const [user, setUser] = useState<SoundScoutUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]).then(([saved, savedUser]) => { if (active && saved) setTokenState(saved); if (active && savedUser) { try { setUser(JSON.parse(savedUser)); } catch { setUser(null); } } })
      .catch(error => console.warn('Could not restore SoundScout session:', error))
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  const setToken = async (next: string, nextUser?: SoundScoutUser | null) => { await SecureStore.setItemAsync(TOKEN_KEY, next); setTokenState(next); if (nextUser) { await SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser)); setUser(nextUser); } };
  const signOut = async () => { await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]); setTokenState(''); setUser(null); };
  const value = useMemo(() => ({ token, user, ready, setToken, signOut }), [token, user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}