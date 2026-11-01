import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, Alert, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';

import { API_URL } from '@/constants/api';
const OTP_DRAFT_KEY = 'soundscout.auth.otp-draft';

type OtpDraft = { email: string; code: string; name: string; age: string; sensitivity: string; newUser: boolean; sent: boolean };

const C = { bg: '#101114', surface: '#1B1D22', text: '#F4F4F5', muted: '#92959F', accent: '#B8F36B', border: '#30323A' };

export default function AuthScreen() {
  const { setToken } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sensitivity, setSensitivity] = useState('3');
  const [newUser, setNewUser] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftReady, setDraftReady] = useState(false);

  // Android may reclaim the app process while the user switches to their email app.
  // Restore the OTP form instead of returning to the initial sign-in screen.
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(OTP_DRAFT_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const draft = JSON.parse(raw) as OtpDraft;
        setEmail(draft.email ?? '');
        setCode(draft.code ?? '');
        setName(draft.name ?? '');
        setAge(draft.age ?? '');
        setSensitivity(draft.sensitivity ?? '3');
        setNewUser(Boolean(draft.newUser));
        setSent(Boolean(draft.sent));
      })
      .catch((e) => console.warn('Could not restore OTP form:', e))
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const draft: OtpDraft = { email, code, name, age, sensitivity, newUser, sent };
    SecureStore.setItemAsync(OTP_DRAFT_KEY, JSON.stringify(draft))
      .catch((e) => console.warn('Could not save OTP form:', e));
  }, [draftReady, email, code, name, age, sensitivity, newUser, sent]);

  const requestCode = async () => {
    if (!email.trim()) return setError('Enter your email address.');
    setBusy(true); setError('');
    try {
      const res = await fetch(API_URL + '/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send code.');
      setNewUser(Boolean(data.isNewUser)); setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (!code.trim()) return setError('Enter the verification code.');
    if (newUser && (!name.trim() || !age.trim())) return setError('Enter your name and age to create an account.');
    setBusy(true); setError('');
    try {
      const res = await fetch(API_URL + '/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code: code.trim(), ...(newUser ? { name: name.trim(), age: Number(age), sensitivity: Number(sensitivity) } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      if (!data.token) throw new Error('Authentication token was not returned.');
      await SecureStore.deleteItemAsync(OTP_DRAFT_KEY);
      await setToken(data.token, data.user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={s.safe}><StatusBar barStyle="light-content" /><View style={s.content}>
    <Text style={s.brand}>SOUNDSCOUT</Text><Text style={s.title}>Welcome</Text>
    <Text style={s.subtitle}>Sign in or create an account to explore venues and contribute ratings.</Text>
    <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" style={s.input} />
    {sent && newUser ? <><TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} style={s.input} /><TextInput value={age} onChangeText={setAge} placeholder="Age" placeholderTextColor={C.muted} keyboardType="number-pad" style={s.input} /><TextInput value={sensitivity} onChangeText={setSensitivity} placeholder="Sound sensitivity (1–5)" placeholderTextColor={C.muted} keyboardType="number-pad" style={s.input} /></> : null}
    {sent ? <TextInput value={code} onChangeText={setCode} placeholder="Email verification code" placeholderTextColor={C.muted} keyboardType="number-pad" style={s.input} /> : null}
    <Pressable disabled={busy} onPress={sent ? verify : requestCode} style={s.button}>{busy ? <ActivityIndicator color={C.bg} /> : <Text style={s.buttonText}>{sent ? 'VERIFY & CONTINUE' : 'CONTINUE WITH EMAIL'}</Text>}</Pressable>
    {sent ? <Pressable onPress={requestCode} style={s.resend}><Text style={s.resendText}>Resend code</Text></Pressable> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}
  </View></SafeAreaView>;
}
const s = StyleSheet.create({ safe:{flex:1,backgroundColor:C.bg},content:{flex:1,justifyContent:'center',padding:26},brand:{color:C.accent,fontSize:11,fontWeight:'900',letterSpacing:3},title:{color:C.text,fontSize:34,fontWeight:'900',marginTop:14},subtitle:{color:C.muted,fontSize:14,lineHeight:22,marginTop:8,marginBottom:24},input:{color:C.text,backgroundColor:C.surface,borderColor:C.border,borderWidth:1,borderRadius:11,padding:14,marginTop:10},button:{backgroundColor:C.accent,borderRadius:11,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:18},buttonText:{color:C.bg,fontSize:11,fontWeight:'900',letterSpacing:1},resend:{alignItems:'center',padding:14},resendText:{color:C.muted,fontSize:12,textDecorationLine:'underline'},error:{color:'#F08A8A',marginTop:14,fontSize:12} });
