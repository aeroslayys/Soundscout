import { useMemo } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/context/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors: C, resolved } = useAppTheme();
  const s = useMemo(() => createStyles(C), [C]);

  const openAuth = (next: 'map' | 'add-venue') => {
    router.push(`/auth?next=${next}` as never);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={s.content}>
        <View style={s.brandRow}>
          <View style={s.brandMark}><View style={s.brandDot} /></View>
          <Text style={s.brand}>SOUNDSCOUT</Text>
        </View>

        <View style={s.hero}>
          <Text style={s.eyebrow}>SOUND-AWARE PLACES</Text>
          <Text style={s.title}>Know the sound{ '\\n' }before you go.</Text>
          <Text style={s.subtitle}>
            Explore sound environments, share what you experience, and make more informed decisions about where to go.
          </Text>
        </View>

        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contribute to SoundScout"
            onPress={() => openAuth('add-venue')}
            style={({ pressed }) => [s.actionCard, s.primaryCard, pressed && s.pressed]}>
            <View style={s.actionIcon}><Text style={s.iconText}>⌖</Text></View>
            <View style={s.actionCopy}>
              <Text style={s.primaryTitle}>Contribute</Text>
              <Text style={s.primaryDescription}>Add a venue or share a sound observation.</Text>
            </View>
            <Text style={s.arrow}>↗</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore venues in SoundScout"
            onPress={() => openAuth('map')}
            style={({ pressed }) => [s.actionCard, s.secondaryCard, pressed && s.pressed]}>
            <View style={s.secondaryIcon}><Text style={s.secondaryIconText}>⌕</Text></View>
            <View style={s.actionCopy}>
              <Text style={s.secondaryTitle}>Explore venues</Text>
              <Text style={s.secondaryDescription}>Browse the native map and community sound reports.</Text>
            </View>
            <Text style={s.secondaryArrow}>↗</Text>
          </Pressable>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account?</Text>
          <Pressable onPress={() => openAuth('map')} hitSlop={10}>
            <Text style={s.signIn}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (C: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 25, paddingTop: 22, paddingBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 27, height: 27, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.bg },
  brand: { color: C.text, fontSize: 12, fontWeight: '900', letterSpacing: 2.5 },
  hero: { marginTop: 42, marginBottom: 34 },
  eyebrow: { color: C.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginBottom: 14 },
  title: { color: C.text, fontSize: 39, lineHeight: 44, fontWeight: '900', letterSpacing: -1.5 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 22, marginTop: 17, maxWidth: 330 },
  actions: { gap: 12 },
  actionCard: { minHeight: 108, borderRadius: 17, borderWidth: 1, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 13 },
  primaryCard: { backgroundColor: C.surface, borderColor: C.accent },
  secondaryCard: { backgroundColor: C.surface, borderColor: C.border },
  actionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: C.bg, fontSize: 26, lineHeight: 30, fontWeight: '700' },
  secondaryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  secondaryIconText: { color: C.text, fontSize: 25, lineHeight: 29, fontWeight: '700' },
  actionCopy: { flex: 1, gap: 5 },
  primaryTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  primaryDescription: { color: C.muted, fontSize: 11, lineHeight: 16 },
  secondaryTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  secondaryDescription: { color: C.muted, fontSize: 11, lineHeight: 16 },
  arrow: { color: C.accent, fontSize: 20, fontWeight: '700' },
  secondaryArrow: { color: C.muted, fontSize: 20, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 25 },
  footerText: { color: C.muted, fontSize: 12 },
  signIn: { color: C.accent, fontSize: 12, fontWeight: '800' }
});
