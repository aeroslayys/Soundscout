
import { useEffect, useState } from 'react';
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

const API_URL = 'http://192.168.101.73:8082';

type Rating = {
  id: string;
  score: number;
  time?: string;
  measured_db?: number | null;
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

const COLORS = {
  background: '#101114',
  surface: '#1B1D22',
  surfaceLight: '#252830',
  text: '#F4F4F5',
  muted: '#92959F',
  accent: '#B8F36B',
  border: '#30323A',
  danger: '#FF7474',
};

export default function VenueDetailsScreen() {
  const router = useRouter();
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
    ? venue.ratings.reduce((sum, rating) => sum + rating.score, 0) /
      venue.ratings.length
    : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
        onPress={() => router.replace('/')}
        style={styles.backButton}
        ></Pressable>

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
              <Text style={styles.infoTitle}>Restroom</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 22,
    paddingBottom: 60,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    marginBottom: 30,
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

