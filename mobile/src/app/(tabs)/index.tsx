
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

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

function averageRating(ratings: Rating[] = []) {
  if (!ratings.length) return null;

  return (
    ratings.reduce((sum, rating) => sum + rating.score, 0) /
    ratings.length
  );
}

function VenueCard({
  venue,
  onPress,
}: {
  venue: Venue;
  onPress: () => void;
}) {
  const average = averageRating(venue.ratings);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.venueCard,
        pressed && styles.venueCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.venueTop}>
        <View style={styles.categoryIcon}>
          <Text style={styles.categoryEmoji}>
            {venue.category === 'cafe'
              ? '☕'
              : venue.category === 'restaurant'
                ? '🍽'
                : '📍'}
          </Text>
        </View>

        <View style={styles.venueInfo}>
          <Text style={styles.venueName}>{venue.name}</Text>
          <Text style={styles.category}>
            {venue.category.toUpperCase()}
          </Text>
        </View>

        <View style={styles.rating}>
          <Text style={styles.ratingText}>
            {average === null ? 'New' : `★ ${average.toFixed(1)}`}
          </Text>
        </View>
      </View>

      <View style={styles.venueDivider} />

      <View style={styles.venueDetails}>
        <Text style={styles.detailText}>
          {venue.access ? '♿ Accessible' : 'Accessibility unknown'}
        </Text>

        <Text style={styles.detailText}>
          {venue.toilet ? '✓ Restroom' : 'Restroom unavailable'}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.reviewCount}>
          {venue.ratings?.length ?? 0} community ratings
        </Text>

        <Text style={styles.viewDetails}>VIEW DETAILS →</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchVenues = useCallback(async () => {
    try {
      setError('');

      const response = await fetch(`${API_URL}/api/venues`);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data: Venue[] = await response.json();
      setVenues(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load venues'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const filteredVenues = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return venues;

    return venues.filter(
      (venue) =>
        venue.name.toLowerCase().includes(query) ||
        venue.category.toLowerCase().includes(query)
    );
  }, [venues, search]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVenues();
  };

  const openVenue = (venue: Venue) => {
    router.push({
      pathname: '/venue/[id]',
      params: { id: venue.id },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>SOUNDSCOUT</Text>
            <Text style={styles.location}>
              DISCOVER YOUR NEXT SPOT
            </Text>
          </View>

          <View style={styles.profileIcon}>
            <Text style={styles.profileLetter}>S</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            YOUR SPACE. YOUR SOUND.
          </Text>

          <Text style={styles.headline}>
            Find your kind{'\n'}of quiet.
          </Text>

          <Text style={styles.subtitle}>
            Discover cafes, restaurants and spaces based on the
            atmosphere that matters to you.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search places or categories..."
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
          />

          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Explore places
            </Text>

            <Text style={styles.sectionSubtitle}>
              Community-reviewed spaces
            </Text>
          </View>

          <Text style={styles.count}>
            {venues.length} PLACES
          </Text>
        </View>

        {loading ? (
          <View style={styles.message}>
            <ActivityIndicator
              color={COLORS.accent}
              size="large"
            />
            <Text style={styles.messageText}>
              Finding your spaces...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.message}>
            <Text style={styles.errorTitle}>
              Couldn't load venues
            </Text>

            <Text style={styles.messageText}>{error}</Text>

            <Pressable
              style={styles.retryButton}
              onPress={fetchVenues}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredVenues.length === 0 ? (
          <View style={styles.message}>
            <Text style={styles.messageText}>
              No matching places found.
            </Text>
          </View>
        ) : (
          filteredVenues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              onPress={() => openVenue(venue)}
            />
          ))
        )}

        <Text style={styles.footer}>
          SOUNDSCOUT · FIND YOUR FREQUENCY
        </Text>
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
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 110,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brand: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
  },

  location: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 5,
  },

  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  profileLetter: {
    color: COLORS.accent,
    fontWeight: '800',
    fontSize: 16,
  },

  hero: {
    marginTop: 42,
    marginBottom: 26,
  },

  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 13,
  },

  headline: {
    color: COLORS.text,
    fontSize: 43,
    lineHeight: 49,
    fontWeight: '800',
    letterSpacing: -1.8,
  },

  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 13,
    maxWidth: 300,
  },

  searchBox: {
    height: 54,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },

  searchIcon: {
    fontSize: 25,
    color: COLORS.accent,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
  },

  clearSearch: {
    color: COLORS.muted,
    fontSize: 17,
    padding: 5,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 34,
    marginBottom: 17,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  count: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  venueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 13,
  },

  venueCardPressed: {
    opacity: 0.75,
    borderColor: COLORS.accent,
  },

  venueTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  categoryIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  categoryEmoji: {
    fontSize: 19,
  },

  venueInfo: {
    flex: 1,
    marginLeft: 12,
  },

  venueName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },

  category: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1.4,
    marginTop: 5,
  },

  rating: {
    backgroundColor: '#303B25',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },

  ratingText: {
    color: COLORS.accent,
    fontWeight: '800',
    fontSize: 12,
  },

  venueDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  venueDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
  },

  detailText: {
    color: COLORS.muted,
    fontSize: 10,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },

  reviewCount: {
    color: COLORS.muted,
    fontSize: 10,
  },

  viewDetails: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  message: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },

  messageText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
  },

  errorTitle: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '700',
  },

  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 5,
  },

  retryText: {
    color: COLORS.background,
    fontWeight: '800',
    fontSize: 12,
  },

  footer: {
    color: COLORS.muted,
    fontSize: 9,
    textAlign: 'center',
    letterSpacing: 2,
    marginTop: 28,
  },
});
