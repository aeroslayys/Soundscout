
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { palettes, useAppTheme } from '@/context/theme';

const API_URL = 'http://192.168.101.73:8082';

type Rating = {
  id: string;
  score: number;
  time?: string;
  measured_db?: number | null;
  timestamp?: number;
};

type Venue = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  access?: boolean;
  toilet?: boolean;
  ratings?: Rating[];
};

export default function VenueDetailsScreen() {
  const router = useRouter();
  const { colors: COLORS, resolved } = useAppTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadVenue() {
      try {
        const response = await fetch(`${API_URL}/api/venues`);

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const venues: Venue[] = await response.json();
        const selected = venues.find(item => item.id === id);

        if (!selected) {
          throw new Error('Venue not found');
        }

        setVenue(selected);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to load venue'
        );
      } finally {
        setLoading(false);
      }
    }

    loadVenue();
  }, [id]);

  const average = venue?.ratings?.length
    ? venue.ratings.reduce((sum, rating) => sum + Number(rating.score), 0) / venue.ratings.length
    : null;

  const timeBuckets = useMemo(() => {
    const order = ['morning', 'afternoon', 'evening', 'night'];
    const getPeriod = (rating: Rating) => {
      const explicit = String(rating.time ?? '').trim().toLowerCase();
      if (order.includes(explicit)) return explicit;
      if (rating.timestamp != null) {
        const date = new Date(Number(rating.timestamp));
        if (!Number.isNaN(date.getTime())) {
          const hour = date.getHours();
          if (hour < 11) return 'morning';
          if (hour <= 15) return 'afternoon';
          if (hour <= 20) return 'evening';
          return 'night';
        }
      }
      return '';
    };
    return order.map((period) => {
      const entries = (venue?.ratings ?? []).filter((rating) => getPeriod(rating) === period);
      const scoreValues = entries.map((rating) => Number(rating.score)).filter(Number.isFinite);
      const score = scoreValues.length
        ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
        : null;
      const dbValues = entries.map((rating) => rating.measured_db).filter((value): value is number => value != null && Number.isFinite(Number(value))).map(Number);
      const db = dbValues.length
        ? dbValues.reduce((sum, value) => sum + value, 0) / dbValues.length
        : null;
      return { period, label: period[0].toUpperCase() + period.slice(1), count: entries.length, score, db };
    });
  }, [venue]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={resolved === "dark" ? "light-content" : "dark-content"} />

      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          onPress={() => router.replace('/')}
          style={styles.backButton}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹  BACK TO MAP</Text>
        </Pressable>

        {loading ? (
          <View style={styles.message}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.muted}>Loading venue details...</Text>
          </View>
        ) : error ? (
          <View style={styles.message}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : venue ? (
          <>
            <Text style={styles.eyebrow}>SOUNDSCOUT / VENUE</Text>
            <Text style={styles.title}>{venue.name}</Text>
            <Text style={styles.category}>
              {venue.category.toUpperCase()}
            </Text>

            <View style={styles.ratingCard}>
              <Text style={styles.ratingNumber}>
                {average === null ? 'NEW' : average.toFixed(1)}
                {average !== null ? ' ★' : ''}
              </Text>
              <Text style={styles.muted}>
                {venue.ratings?.length ?? 0} community ratings
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Venue facilities</Text>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Accessibility</Text>
              <Text style={styles.infoValue}>
                {venue.access ? '✓ Accessible' : 'Not marked as accessible'}
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Gender-neutral washroom</Text>
              <Text style={styles.infoValue}>
                {venue.toilet ? '✓ Available' : 'Not available'}
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Location coordinates</Text>
              <Text style={styles.infoValue}>
                {venue.lat}, {venue.lng}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Sound by time of day</Text>
            <View style={styles.chartCard}>
              <Text style={styles.chartDescription}>Average community quietness rating for each time period (1 = loud, 5 = silent).</Text>
              <View style={styles.chart}>
                {timeBuckets.map((bucket) => (
                  <View key={bucket.period} style={styles.chartColumn}>
                    <Text style={styles.chartValue}>{bucket.score === null ? '—' : bucket.score.toFixed(1)}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: bucket.score === null ? 0 : Math.max(5, (bucket.score / 5) * 100) + '%' }]} />
                    </View>
                    <Text style={styles.chartLabel}>{bucket.label}</Text>
                    <Text style={styles.chartCount}>{bucket.count} {bucket.count === 1 ? 'rating' : 'ratings'}</Text>
                    {bucket.db !== null ? <Text style={styles.chartDb}>{bucket.db.toFixed(1)} dBFS</Text> : null}
                  </View>
                ))}
              </View>
              {!timeBuckets.some((bucket) => bucket.count > 0) ? (
                <Text style={styles.muted}>No time-of-day data yet. Ratings will appear here as the community contributes.</Text>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Community ratings</Text>

            {venue.ratings?.length ? (
              venue.ratings.map((rating, index) => (
                <View key={rating.id} style={styles.reviewCard}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.reviewTitle}>
                      Rating {index + 1}
                    </Text>
                    <Text style={styles.reviewScore}>
                      ★ {rating.score}/5
                    </Text>
                  </View>
                  {rating.time ? (
                    <Text style={styles.muted}>
                      Time of visit: {rating.time}
                    </Text>
                  ) : null}
                  {rating.measured_db != null ? (
                    <Text style={styles.muted}>
                      Measured noise: {rating.measured_db} dB
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.muted}>
                No community ratings yet. Be the first to review this place.
              </Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (COLORS: typeof palettes.dark) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 22,
  },
  backText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    marginBottom: 15,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
  category: {
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 10,
  },
  ratingCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    marginTop: 30,
    marginBottom: 34,
  },
  ratingNumber: {
    color: COLORS.accent,
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 7,
  },
  chartCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 22 },
  chartDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginBottom: 18 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 164, gap: 8 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartValue: { color: COLORS.text, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  barTrack: { width: '72%', height: 100, justifyContent: 'flex-end', backgroundColor: COLORS.surfaceLight, borderRadius: 7, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: COLORS.accent, borderRadius: 7 },
  chartLabel: { color: COLORS.text, fontSize: 9, fontWeight: '700', marginTop: 8 },
  chartCount: { color: COLORS.muted, fontSize: 8, marginTop: 3, textAlign: 'center' },
  chartDb: { color: COLORS.muted, fontSize: 8, marginTop: 3 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 15,
    marginTop: 12,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 17,
    marginBottom: 11,
  },
  infoTitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginBottom: 8,
  },
  infoValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 17,
    marginBottom: 11,
  },
  reviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewTitle: {
    color: COLORS.text,
    fontWeight: '700',
  },
  reviewScore: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  muted: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  message: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  error: {
    color: COLORS.danger,
    fontSize: 14,
  },
});

