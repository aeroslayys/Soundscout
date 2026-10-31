import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = { bg: '#101114', surface: '#1B1D22', text: '#F4F4F5', muted: '#92959F', accent: '#B8F36B', border: '#30323A' };

export default function MyRatingsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR CONTRIBUTIONS</Text>
        <Text style={styles.title}>My Ratings</Text>
        <Text style={styles.subtitle}>Your sound reports and the venues you've added.</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your rating history</Text>
          <Text style={styles.body}>This page will show your submitted quietness scores, time of visit, measured dBFS readings, and the venue associated with each report.</Text>
          <View style={styles.rule} />
          <Text style={styles.cardTitle}>Venues you've added</Text>
          <Text style={styles.body}>Track your venue submissions and their approval status here.</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Sign-in integration pending</Text>
          <Text style={styles.body}>The backend already provides GET /api/users/me/ratings and GET /api/users/me/venues. Both require the user's bearer token. Mobile authentication and secure token storage must be connected before personal data can be loaded.</Text>
        </View>
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
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  body: { color: C.muted, fontSize: 13, lineHeight: 21 },
  rule: { height: 1, backgroundColor: C.border, marginVertical: 17 },
  notice: { borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 15, marginTop: 16 },
  noticeTitle: { color: C.accent, fontSize: 12, fontWeight: '800', marginBottom: 7 },
});
