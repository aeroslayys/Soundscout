import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'soundscout.theme.mode';
export const palettes = {
  light: { bg:'#F5F6F2', background:'#F5F6F2', surface:'#FFFFFF', surfaceLight:'#E9ECE5', text:'#20251F', muted:'#687267', accent:'#568B35', border:'#D9DED5', danger:'#C94F4F', warning:'#9A6B18', success:'#47845A' },
  dark: { bg:'#101114', background:'#101114', surface:'#1B1D22', surfaceLight:'#252830', text:'#F4F4F5', muted:'#92959F', accent:'#B8F36B', border:'#30323A', danger:'#FF7474', warning:'#E7BD68', success:'#8BC99C' },
};
type ThemeContextValue = { mode: ThemeMode; resolved: 'light'|'dark'; colors: typeof palettes.dark; setMode: (mode: ThemeMode) => Promise<void>; ready: boolean };
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode,setModeState] = useState<ThemeMode>('system');
  const [ready,setReady] = useState(false);
  useEffect(() => { let active=true; SecureStore.getItemAsync(KEY).then(value => { if(active && (value==='system'||value==='light'||value==='dark')) setModeState(value); }).catch(error=>console.warn('Could not load theme preference:',error)).finally(()=>{if(active)setReady(true);}); return ()=>{active=false;}; },[]);
  const setMode = async (next: ThemeMode) => { await SecureStore.setItemAsync(KEY,next); setModeState(next); };
  const resolved = mode==='system' ? (system==='dark'?'dark':'light') : mode;
  const value = useMemo(()=>({mode,resolved,colors:palettes[resolved],setMode,ready}),[mode,resolved,ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme() { const value=useContext(ThemeContext); if(!value) throw new Error('useAppTheme must be used inside ThemeProvider'); return value; }
