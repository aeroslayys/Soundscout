import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Heatmap, Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const API_URL = 'http://192.168.101.73:8082';

type Rating = {
  id: string;
  score: number;
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

const INITIAL_REGION: Region = {
  latitude: 12.0022,
  longitude: 79.8100,
  latitudeDelta: 0.075,
  longitudeDelta: 0.075,
};

const HEAT_GRADIENT = {
  colors: ['#4E8F73', '#82A374', '#D1B45B', '#D7864D', '#BD5B45'],
  startPoints: [0.2, 0.4, 0.6, 0.8, 1],
  colorMapSize: 256,
};

function averageRating(ratings: Rating[] = []) {
  if (!ratings.length) return null;
  return ratings.reduce((sum, rating) => sum + Number(rating.score), 0) / ratings.length;
}

function soundColor(score: number | null) {
  if (score === null) return '#92959F';
  const t = (score - 1) / 4;
  const quiet = [0x4e, 0x8f, 0x73];
  const loud = [0xbd, 0x5b, 0x45];
  const mix = (index: number) =>
    Math.round(quiet[index] + (loud[index] - quiet[index]) * (1 - t));
  return '#' + [mix(0), mix(1), mix(2)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

type VenueCluster = {
  id: string;
  venues: Venue[];
  latitude: number;
  longitude: number;
};

function distanceMeters(a: Venue, b: Venue) {
  const latitude = (Number(a.lat) + Number(b.lat)) / 2;
  const latitudeDistance = (Number(a.lat) - Number(b.lat)) * 111_320;
  const longitudeDistance =
    (Number(a.lng) - Number(b.lng)) * 111_320 * Math.cos((latitude * Math.PI) / 180);
  return Math.hypot(latitudeDistance, longitudeDistance);
}

function clusterVenues(venues: Venue[], region: Region): VenueCluster[] {
  // The clustering radius shrinks as the user zooms in, so individual venues
  // become selectable naturally at street level.
  const radius = Math.max(25, Math.min(250, region.longitudeDelta * 111_320 * 0.025));
  const groups: Venue[][] = [];

  venues.forEach((venue) => {
    const nearbyGroup = groups.find((group) =>
      group.some((member) => distanceMeters(venue, member) <= radius)
    );
    if (nearbyGroup) nearbyGroup.push(venue);
    else groups.push([venue]);
  });

  return groups.map((group) => ({
    id: group.map((venue) => venue.id).sort().join('-'),
    venues: group,
    latitude: group.reduce((sum, venue) => sum + Number(venue.lat), 0) / group.length,
    longitude: group.reduce((sum, venue) => sum + Number(venue.lng), 0) / group.length,
  }));
}

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [category, setCategory] = useState('all');

  const fetchVenues = useCallback(async () => {
    try {
      setError('');
      const response = await fetch(`${API_URL}/api/venues`);
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
      const data: Venue[] = await response.json();
      setVenues(data.filter((venue) =>
        Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng))
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load venues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const filteredVenues = useMemo(
    () => category === 'all' ? venues : venues.filter((venue) => venue.category === category),
    [category, venues]
  );

  const heatPoints = useMemo(
    () => filteredVenues.flatMap((venue) => {
      const score = averageRating(venue.ratings);
      if (score === null) return [];
      return [{
        latitude: Number(venue.lat),
        longitude: Number(venue.lng),
        weight: Math.max(0.2, Math.min(1, (6 - score) / 5)),
      }];
    }),
    [filteredVenues]
  );

  const clusters = useMemo(
    () => clusterVenues(filteredVenues, region),
    [filteredVenues, region]
  );

  const zoomIntoCluster = (cluster: VenueCluster) => {
    setSelected(null);
    mapRef.current?.animateToRegion({
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      latitudeDelta: Math.max(region.latitudeDelta / 2, 0.002),
      longitudeDelta: Math.max(region.longitudeDelta / 2, 0.002),
    }, 350);
  };

  const categories = ['all', 'cafe', 'restaurant', 'library', 'gym', 'coworking'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        mapType="standard"
        showsCompass
        showsScale
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
        onRegionChangeComplete={setRegion}
      >
        {heatmapEnabled && heatPoints.length > 0 && Platform.OS === 'android' ? (
          <Heatmap
            points={heatPoints}
            radius={48}
            opacity={0.72}
            gradient={HEAT_GRADIENT}
          />
        ) : null}

        {heatmapEnabled && Platform.OS !== 'android' ? filteredVenues.map((venue) => {
          const score = averageRating(venue.ratings);
          if (score === null) return null;
          const weight = Math.max(0.2, Math.min(1, (6 - score) / 5));
          return (
            <Circle
              key={`heat-${venue.id}`}
              center={{ latitude: Number(venue.lat), longitude: Number(venue.lng) }}
              radius={35 + weight * 30}
              fillColor={soundColor(score) + '55'}
              strokeColor={soundColor(score) + '88'}
              strokeWidth={1}
            />
          );
        }) : null}

        {clusters.map((cluster) => {
          if (cluster.venues.length === 1) {
            const venue = cluster.venues[0];
            const score = averageRating(venue.ratings);
            return (
              <Marker
                key={venue.id}
                coordinate={{ latitude: Number(venue.lat), longitude: Number(venue.lng) }}
                title={venue.name}
                description={score === null ? 'Not rated yet' : `${score.toFixed(1)} / 5 · ${venue.category}`}
                pinColor={soundColor(score)}
                onPress={() => setSelected(venue)}
              />
            );
          }

          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              onPress={() => zoomIntoCluster(cluster)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.clusterMarker}>
                <Text style={styles.clusterCount}>{cluster.venues.length}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.topOverlay}>
        <View style={styles.headingCard}>
          <Text style={styles.brand}>SOUNDSCOUT MAP</Text>
          <Text style={styles.subtitle}>Explore the sound of your city</Text>
        </View>

        <View style={styles.categoryRow}>
          {categories.map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setCategory(item);
                setSelected(null);
              }}
              style={[styles.categoryChip, category === item && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>
                {item === 'all' ? 'All' : item === 'cafe' ? 'Cafés' : item[0].toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.mapActions}>
        <Pressable
          style={[styles.actionButton, heatmapEnabled && styles.actionButtonActive]}
          onPress={() => setHeatmapEnabled((value) => !value)}
        >
          <Text style={[styles.actionText, heatmapEnabled && styles.actionTextActive]}>
            {heatmapEnabled ? '●  Heatmap on' : '◉  Show heatmap'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => setSelected(null)}
        >
          <Text style={styles.actionText}>Clear selection</Text>
        </Pressable>
      </View>

      {selected ? (
        <Pressable
          style={styles.selectedCard}
          onPress={() => router.push({ pathname: '/venue/[id]', params: { id: selected.id } })}
        >
          <View style={[styles.soundDot, { backgroundColor: soundColor(averageRating(selected.ratings)) }]} />
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
            <Text style={styles.selectedMeta}>
              {selected.category.toUpperCase()} · {averageRating(selected.ratings) === null
                ? 'NOT RATED'
                : `${averageRating(selected.ratings)!.toFixed(1)} / 5`}
            </Text>
          </View>
          <Text style={styles.viewDetails}>DETAILS →</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator color={COLORS.accent} size="small" />
          <Text style={styles.loadingText}>Loading venues…</Text>
        </View>
      ) : error ? (
        <Pressable style={styles.errorPill} onPress={fetchVenues}>
          <Text style={styles.errorText}>Couldn't load venues · Tap to retry</Text>
        </Pressable>
      ) : (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{filteredVenues.length} PLACES ON MAP</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  topOverlay: { position: 'absolute', top: 8, left: 14, right: 14, gap: 10 },
  headingCard: {
    backgroundColor: COLORS.background + 'EE',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brand: { color: COLORS.accent, fontSize: 13, fontWeight: '900', letterSpacing: 2.2 },
  subtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: {
    backgroundColor: COLORS.background + 'E8',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  categoryText: { color: COLORS.text, fontSize: 10, fontWeight: '700' },
  categoryTextActive: { color: COLORS.background },
  mapActions: { position: 'absolute', top: 142, right: 14, gap: 8, alignItems: 'flex-end' },
  actionButton: {
    backgroundColor: COLORS.background + 'ED',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  actionText: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
  actionTextActive: { color: COLORS.background },
  clusterMarker: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 9,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    borderColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  clusterCount: { color: COLORS.background, fontSize: 13, fontWeight: '900' },
  selectedCard: {
    position: 'absolute',
    bottom: 26,
    left: 14,
    right: 14,
    backgroundColor: COLORS.background + 'F5',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 17,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  soundDot: { width: 13, height: 13, borderRadius: 7 },
  selectedInfo: { flex: 1 },
  selectedName: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  selectedMeta: { color: COLORS.muted, fontSize: 9, letterSpacing: 1, marginTop: 5 },
  viewDetails: { color: COLORS.accent, fontSize: 9, fontWeight: '900' },
  loadingPill: {
    position: 'absolute', bottom: 26, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: COLORS.background + 'F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  loadingText: { color: COLORS.text, fontSize: 11 },
  errorPill: {
    position: 'absolute', bottom: 26, alignSelf: 'center',
    backgroundColor: COLORS.background + 'F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 11 },
  countPill: {
    position: 'absolute', bottom: 26, alignSelf: 'center',
    backgroundColor: COLORS.background + 'E8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
  },
  countText: { color: COLORS.text, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
});
