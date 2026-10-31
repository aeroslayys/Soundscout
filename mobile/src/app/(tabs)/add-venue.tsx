import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = { bg: '#101114', surface: '#1B1D22', text: '#F4F4F5', muted: '#92959F', accent: '#B8F36B', border: '#30323A' };

export default function AddVenueScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CONTRIBUTE TO SOUNDSCOUT</Text>
        <Text style={styles.title}>Add a venue</Text>
        <Text style={styles.subtitle}>Help others find a place that sounds right for them.</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your venue submission</Text>
          <Text style={styles.body}>The web app's add-venue workflow includes a venue name, category, precise map location, accessibility and restroom details, and an initial quietness rating. It can also analyze a 5–10 second audio clip.</Text>
          <View style={styles.rule} />
          <Text style={styles.noteTitle}>Account connection needed</Text>
          <Text style={styles.body}>Venue submissions require a signed-in SoundScout account. Mobile sign-in and secure token storage are not wired up yet, so this screen will not pretend to submit a venue until that is connected.</Text>
        </View>
        <Text style={styles.next}>Next: bring the web form's location picker, rating scale, facility toggles and audio analysis into this screen, using the existing POST /api/venues contract.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 22, paddingBottom: 50 },
  eyebrow: { color: C.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 14 },
  title: { color: C.text, fontSize: 32, fontWeight: '900', marginTop: 10 },
  subtitle: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 28 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  body: { color: C.muted, fontSize: 13, lineHeight: 21 },
  rule: { height: 1, backgroundColor: C.border, marginVertical: 17 },
  noteTitle: { color: C.accent, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  next: { color: C.muted, fontSize: 11, lineHeight: 18, marginTop: 18 },
});
