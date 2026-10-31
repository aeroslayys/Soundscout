import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { useAppTheme, type ThemeMode, palettes } from '@/context/theme';

const API_URL = 'http://192.168.101.73:8082';
const C = {
  bg: '#101114',
  surface: '#1B1D22',
  surfaceLight: '#252830',
  text: '#F4F4F5',
  muted: '#92959F',
  accent: '#B8F36B',
  border: '#30323A',
  warning: '#E7BD68',
  success: '#8BC99C',
};

type RatingItem = {
  id: string | number;
  score: number;
  time?: string;
  measured_db?: number | null;
  timestamp?: number;
  venueId: string;
  venueName: string;
  category?: string;
  access?: boolean;
  toilet?: boolean;
  isVenueCreator?: boolean;
};

type VenueItem = {
  id: string | number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  access?: boolean;
  toilet?: boolean;
  created_at?: string;
  status?: string;
  ratingCount?: number | string;
  averageScore?: number | string | null;
  averageMeasuredDb?: number | string | null;
};

function dateLabel(value?: number | string) {
  if (!value) return 'Date unavailable';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusColor(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'approved') return '#8BC99C';
  if (normalized === 'rejected') return '#F08A8A';
  return C.warning;
}

export default function MyRatingsScreen() {
  const { mode, colors: C, setMode } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sensitivity, setSensitivity] = useState('3');
  const [isNewUser, setIsNewUser] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const { token, user, setToken, signOut: clearAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [activeSection, setActiveSection] = useState<'ratings' | 'venues'>('ratings');

  const loadAccountData = useCallback(async (authToken: string) => {
    setLoadingData(true);
    setError('');
    try {
      const headers = { Authorization: 'Bearer ' + authToken };
      const [ratingResponse, venueResponse] = await Promise.all([
        fetch(API_URL + '/api/users/me/ratings', { headers }),
        fetch(API_URL + '/api/users/me/venues', { headers }),
      ]);
      const [ratingData, venueData] = await Promise.all([
        ratingResponse.json(),
        venueResponse.json(),
      ]);
      if (!ratingResponse.ok) throw new Error(ratingData.error || 'Could not load your ratings.');
      if (!venueResponse.ok) throw new Error(venueData.error || 'Could not load your venues.');
      setRatings(Array.isArray(ratingData) ? ratingData : []);
      setVenues(Array.isArray(venueData) ? venueData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account data.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  const requestCode = async () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the email address for your SoundScout account.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_URL + '/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send verification code.');
      setIsNewUser(Boolean(data.isNewUser));
      setOtpSent(true);
      Alert.alert('Check your email', 'A one-time verification code has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) {
      Alert.alert('Code required', 'Enter the verification code from your email.');
      return;
    }
    if (isNewUser && (!name.trim() || !age.trim())) {
      Alert.alert('Complete your profile', 'Name and age are required to create an account.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_URL + '/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          ...(isNewUser ? {
            name: name.trim(),
            age: Number(age),
            sensitivity: Number(sensitivity),
          } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification failed.');
      if (!data.token) throw new Error('The server did not return a sign-in token.');
      await setToken(data.token, data.user);
      await loadAccountData(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearAuth();
    setRatings([]);
    setVenues([]);
    setCode('');
    setOtpSent(false);
    setError('');
  };

  useEffect(() => { if (token) loadAccountData(token); }, [token, loadAccountData]);

  const average = ratings.length
    ? (ratings.reduce((sum, item) => sum + Number(item.score || 0), 0) / ratings.length).toFixed(1)
    : '—';
  const uniqueVenues = new Set(ratings.map((item) => item.venueName)).size;
  const initials = (user?.name || user?.email || '?').trim().split(/\\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={C.bg === "#101114" ? "light-content" : "dark-content"} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR CONTRIBUTIONS</Text>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12, padding:12, borderRadius:12, backgroundColor:C.surface, borderWidth:1, borderColor:C.border }}>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:12, fontWeight:'800' }}>Appearance</Text>
            <Text style={{ color:C.muted, fontSize:10, marginTop:3 }}>Choose how SoundScout looks</Text>
          </View>
          <View style={{ flexDirection:'row', gap:4 }}>
            {(['system','light','dark'] as ThemeMode[]).map(option => <Pressable key={option} onPress={() => setMode(option)} style={{ paddingHorizontal:9, paddingVertical:8, borderRadius:8, backgroundColor:mode===option?C.accent:C.surfaceLight }}><Text style={{ color:mode===option?C.bg:C.text, fontSize:9, fontWeight:'800', textTransform:'capitalize' }}>{option}</Text></Pressable>)}
          </View>
        </View>
        {token ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileName}>{user?.name || 'SoundScout member'}</Text>
              <Text style={styles.profileEmail}>{user?.email || 'Email unavailable'}</Text>
              <View style={styles.profileMetaRow}>
                <Text style={styles.profileMeta}>Age {user?.age ?? '—'}</Text>
                <Text style={styles.profileMeta}>Sensitivity {user?.sensitivity != null ? `${user.sensitivity}/5` : '—'}</Text>
              </View>
            </View>
          </View>
        ) : null}
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>My Ratings</Text>
            <Text style={styles.subtitle}>Your sound reports and the venues you've added.</Text>
          </View>
          {token ? (
            <Pressable onPress={signOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>

        {!token ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in to your account</Text>
            <Text style={styles.body}>Use the email address linked to your SoundScout account to view your personal contribution history.</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={C.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            {otpSent && isNewUser ? (
              <>
                <Text style={styles.bodySmall}>This email is not registered yet. Complete these details to create your account.</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} style={styles.input} />
                <TextInput value={age} onChangeText={setAge} placeholder="Age" placeholderTextColor={C.muted} keyboardType="number-pad" style={styles.input} />
                <TextInput value={sensitivity} onChangeText={setSensitivity} placeholder="Sound sensitivity (1–5)" placeholderTextColor={C.muted} keyboardType="number-pad" style={styles.input} />
              </>
            ) : null}
            {otpSent ? (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit verification code"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                style={styles.input}
              />
            ) : null}
            <Pressable disabled={busy} onPress={otpSent ? verifyCode : requestCode} style={styles.primaryButton}>
              {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryButtonText}>{otpSent ? 'VERIFY & VIEW MY RATINGS' : 'SEND SIGN-IN CODE'}</Text>}
            </Pressable>
            {otpSent ? (
              <Pressable disabled={busy} onPress={requestCode} style={styles.resendButton}>
                <Text style={styles.resendText}>Resend code</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{ratings.length}</Text>
                <Text style={styles.statLabel}>RATINGS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{average}</Text>
                <Text style={styles.statLabel}>AVG QUIETNESS GIVEN</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{uniqueVenues}</Text>
                <Text style={styles.statLabel}>VENUES RATED</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{venues.length}</Text>
                <Text style={styles.statLabel}>VENUES ADDED</Text>
              </View>
            </View>
            <View style={styles.segment}>
              <Pressable onPress={() => setActiveSection('ratings')} style={[styles.segmentButton, activeSection === 'ratings' && styles.segmentActive]}>
                <Text style={[styles.segmentText, activeSection === 'ratings' && styles.segmentTextActive]}>My ratings</Text>
              </Pressable>
              <Pressable onPress={() => setActiveSection('venues')} style={[styles.segmentButton, activeSection === 'venues' && styles.segmentActive]}>
                <Text style={[styles.segmentText, activeSection === 'venues' && styles.segmentTextActive]}>Venues added</Text>
              </Pressable>
            </View>
            {loadingData ? (
              <View style={styles.loading}><ActivityIndicator color={C.accent} /><Text style={styles.body}>Loading your contributions…</Text></View>
            ) : (
              <>
                {activeSection === 'ratings' ? (
                  ratings.length ? ratings.map((item) => (
                    <View key={String(item.id)} style={styles.itemCard}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemTitle}>{item.venueName || 'Unknown venue'}</Text>
                        <Text style={styles.score}>{Number(item.score).toFixed(1)} / 5</Text>
                      </View>
                      <Text style={styles.meta}>{item.category || 'Venue'} · {item.time || 'Time not recorded'} · {dateLabel(item.timestamp)}</Text>
                      {item.measured_db !== null && item.measured_db !== undefined ? <Text style={styles.meta}>Measured audio: {Number(item.measured_db).toFixed(1)} dBFS</Text> : null}
                      <View style={styles.tags}>
                        {item.access ? <Text style={styles.tag}>Step-free access</Text> : null}
                        {item.toilet ? <Text style={styles.tag}>Gender-neutral toilet</Text> : null}
                        {item.isVenueCreator ? <Text style={styles.tag}>Venue creator</Text> : null}
                      </View>
                    </View>
                  )) : <Text style={styles.empty}>You haven't submitted any ratings yet.</Text>
                ) : (
                  venues.length ? venues.map((venue) => (
                    <View key={String(venue.id)} style={styles.itemCard}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemTitle}>{venue.name}</Text>
                        <Text style={[styles.status, { color: statusColor(venue.status) }]}>{venue.status || 'Pending'}</Text>
                      </View>
                      <Text style={styles.meta}>{venue.category} · {Number(venue.ratingCount || 0)} ratings · Added {dateLabel(venue.created_at)}</Text>
                      {venue.averageScore !== null && venue.averageScore !== undefined ? <Text style={styles.meta}>Community quietness: {Number(venue.averageScore).toFixed(1)} / 5</Text> : null}
                      {venue.averageMeasuredDb !== null && venue.averageMeasuredDb !== undefined ? <Text style={styles.meta}>Average measured audio: {Number(venue.averageMeasuredDb).toFixed(1)} dBFS</Text> : null}
                      <View style={styles.tags}>
                        {venue.access ? <Text style={styles.tag}>Step-free access</Text> : null}
                        {venue.toilet ? <Text style={styles.tag}>Gender-neutral toilet</Text> : null}
                      </View>
                    </View>
                  )) : <Text style={styles.empty}>You haven't added any venues yet.</Text>
                )}
              </>
            )}
            <Pressable disabled={loadingData} onPress={() => loadAccountData(token)} style={styles.refreshButton}>
              <Text style={styles.refreshText}>↻ Refresh contributions</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.footer}>Your account data is loaded directly from SoundScout's existing user endpoints.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (C: typeof palettes.dark) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: { color: C.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginTop: 18 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.bg, fontSize: 18, fontWeight: '900' },
  profileDetails: { flex: 1 },
  profileName: { color: C.text, fontSize: 16, fontWeight: '900' },
  profileEmail: { color: C.muted, fontSize: 11, marginTop: 3 },
  profileMetaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  profileMeta: { color: C.muted, backgroundColor: C.surfaceLight, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  headerCopy: { flex: 1 },
  title: { color: C.text, fontSize: 31, fontWeight: '900' },
  subtitle: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 24 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 9 },
  body: { color: C.muted, fontSize: 13, lineHeight: 20 },
  bodySmall: { color: C.muted, fontSize: 11, lineHeight: 17, marginBottom: 9 },
  input: { color: C.text, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 13, marginTop: 11 },
  primaryButton: { backgroundColor: C.accent, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 12 },
  primaryButtonText: { color: C.bg, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  resendButton: { alignItems: 'center', padding: 12 },
  resendText: { color: C.muted, fontSize: 11, textDecorationLine: 'underline' },
  signOutButton: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border, borderRadius: 9 },
  signOutText: { color: C.text, fontSize: 11, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  statCard: { flex: 1, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  statValue: { color: C.text, fontSize: 21, fontWeight: '900' },
  statLabel: { color: C.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 5 },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 11, padding: 4, marginTop: 20, marginBottom: 12 },
  segmentButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: C.surfaceLight },
  segmentText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  segmentTextActive: { color: C.text },
  loading: { alignItems: 'center', padding: 28, gap: 10 },
  itemCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 14, marginTop: 9 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemTitle: { color: C.text, fontSize: 14, fontWeight: '800', flex: 1 },
  score: { color: C.accent, fontSize: 12, fontWeight: '900' },
  status: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  meta: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  tag: { color: C.success, fontSize: 9, backgroundColor: '#8BC99C18', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  empty: { color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 30 },
  refreshButton: { alignItems: 'center', padding: 14, marginTop: 10 },
  refreshText: { color: C.accent, fontSize: 11, fontWeight: '800' },
  error: { color: '#F08A8A', fontSize: 12, marginTop: 16, lineHeight: 18 },
  footer: { color: C.muted, fontSize: 9, lineHeight: 15, marginTop: 20, textAlign: 'center' },
});
