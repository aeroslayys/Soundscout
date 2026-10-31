import React, { createContext, useContext, useMemo, useState } from 'react';

type AuthValue = { token: string; setToken: (token: string) => void; signOut: () => void };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const value = useMemo(() => ({ token, setToken, signOut: () => setToken('') }), [token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
