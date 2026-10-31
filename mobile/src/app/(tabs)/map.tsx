import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Alert,
  View,
} from 'react-native';
import MapView, { Circle, Heatmap, Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import AudioCapture from '@/components/audio-capture';

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
  const { token: authToken } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [category, setCategory] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [ratingExpanded, setRatingExpanded] = useState(false);
  const [ratingScore, setRatingScore] = useState(4);
  const [ratingMeasuredDb, setRatingMeasuredDb] = useState<number | null>(null);
  const [ratingHasAudio, setRatingHasAudio] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [newAccount, setNewAccount] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupAge, setSignupAge] = useState('');
  const [signupSensitivity, setSignupSensitivity] = useState('3');
  const [authCode, setAuthCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

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


  const submitVenueRating = async () => {
    if (!selected) return;
    if (!authToken) {
      setRatingExpanded(true);
      return;
    }
    setRatingBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/venues/${selected.id}/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ score: ratingScore, measured_db: ratingMeasuredDb, had_audio_clip: ratingHasAudio }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save rating.');
      const refreshed = await fetch(`${API_URL}/api/venues`);
      if (refreshed.ok) {
        const list: Venue[] = await refreshed.json();
        const valid = list.filter((venue) =>
          Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng))
        );
        setVenues(valid);
        const updated = valid.find((venue) => venue.id === selected.id);
        if (updated) setSelected(updated);
      }
      setRatingExpanded(false);
      Alert.alert('Rating submitted', 'Your quietness rating has been added.');
    } catch (err) {
      Alert.alert('Could not submit rating', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRatingBusy(false);
    }
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

      <View style={styles.filterRail}>
        <Pressable
          style={styles.filterToggle}
          onPress={() => setFiltersExpanded((value) => !value)}
          hitSlop={8}
        >
          <Text style={styles.filterToggleText}>{filtersExpanded ? '×' : '☰'}</Text>
        </Pressable>
        {filtersExpanded ? (
          <View style={styles.filterButtons}>
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
            <Pressable
              style={[styles.actionButton, heatmapEnabled && styles.actionButtonActive]}
              onPress={() => setHeatmapEnabled((value) => !value)}
            >
              <Text style={[styles.actionText, heatmapEnabled && styles.actionTextActive]}>
                {heatmapEnabled ? 'Heatmap on' : 'Heatmap'}
              </Text>
            </Pressable>
            {selected ? (
              <Pressable style={styles.actionButton} onPress={() => setSelected(null)}>
                <Text style={styles.actionText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {selected ? (
        <View style={styles.selectedSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeading}>
            <View style={[styles.soundDot, { backgroundColor: soundColor(averageRating(selected.ratings)) }]} />
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedName}>{selected.name}</Text>
              <Text style={styles.selectedMeta}>{selected.category.toUpperCase()}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}>
              <Text style={styles.closeSheet}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>
              {averageRating(selected.ratings) === null ? '—' : averageRating(selected.ratings)!.toFixed(1)}
            </Text>
            <View style={styles.scoreCaption}>
              <Text style={styles.scoreLabel}>
                {averageRating(selected.ratings) === null ? 'Not rated yet' :
                  averageRating(selected.ratings)! >= 4 ? 'Calm / Silent' :
                  averageRating(selected.ratings)! >= 3 ? 'Moderate' : 'Lively / Loud'}
              </Text>
              <Text style={styles.sheetMuted}>{selected.ratings?.length ?? 0} community ratings</Text>
            </View>
            <View style={styles.facilityPills}>
              <Text style={styles.facilityText}>{selected.access ? '♿ Accessible' : 'Access unknown'}</Text>
              <Text style={styles.facilityText}>{selected.toilet ? '🚻 Toilet' : 'Toilet unknown'}</Text>
            </View>
          </View>
          <Text style={styles.sheetSection}>RECENT COMMUNITY RATINGS</Text>
          {(selected.ratings ?? []).length ? [...(selected.ratings ?? [])]
            .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0))
            .slice(0, 3).map((rating, index) => (
              <View key={rating.id ?? String(index)} style={styles.ratingLine}>
                <Text style={styles.ratingLineScore}>★ {rating.score}/5</Text>
                <Text style={styles.sheetMuted}>{rating.time ?? 'Time unavailable'}</Text>
                <Text style={styles.sheetMuted}>{rating.measured_db == null ? 'No audio' : `${Number(rating.measured_db).toFixed(1)} dBFS`}</Text>
              </View>
            )) : <Text style={styles.sheetMuted}>No ratings yet. Be the first to share an update.</Text>}
          <Pressable
            style={styles.detailsButton}
            onPress={() => { setRatingExpanded((value) => !value); setRatingMeasuredDb(null); setRatingHasAudio(false); setRatingScore(4); }}
          >
            <Text style={styles.detailsButtonText}>{ratingExpanded ? 'CLOSE RATING FORM' : '＋ RATE THIS PLACE'}</Text>
          </Pressable>
          {ratingExpanded ? (
            <View style={styles.ratingForm}>
              <Text style={styles.formTitle}>HOW QUIET IS THIS PLACE?</Text>
              <Text style={styles.formHint}>1 = Loud · 2 = Lively · 3 = Moderate · 4 = Calm · 5 = Silent</Text>
              <View style={styles.scoreChoices}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Pressable
                    key={score}
                    onPress={() => setRatingScore(score)}
                    style={[styles.scoreChoice, ratingScore === score && styles.scoreChoiceActive]}
                  >
                    <Text style={[styles.scoreChoiceText, ratingScore === score && styles.scoreChoiceTextActive]}>{score}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.formHint}>Optional: record 5–10 seconds of ambient sound. The backend analyzes average loudness; the recording itself is not saved.</Text>
              <AudioCapture onAnalyzed={(db, suggested) => {
                setRatingMeasuredDb(db);
                setRatingHasAudio(true);
                setRatingScore(suggested);
              }} />
              {ratingMeasuredDb !== null ? <Text style={styles.formHint}>Measured {ratingMeasuredDb.toFixed(1)} dBFS · audio analysis complete</Text> : null}
              <Pressable style={styles.submitButton} disabled={ratingBusy} onPress={submitVenueRating}>
                <Text style={styles.submitButtonText}>{ratingBusy ? 'SUBMITTING…' : 'SUBMIT RATING'}</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            style={styles.secondaryDetailsButton}
            onPress={() => router.push({ pathname: '/venue/[id]', params: { id: selected.id } })}
          >
            <Text style={styles.secondaryDetailsText}>VIEW FULL VENUE DETAILS →</Text>
          </Pressable>
        </View>
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
  filterRail: {
    position: 'absolute',
    top: '34%',
    right: 0,
    alignItems: 'flex-end',
  },
  filterToggle: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 13,
    borderBottomLeftRadius: 13,
    backgroundColor: COLORS.background + 'E8',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: COLORS.border,
  },
  filterToggleText: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  filterButtons: { alignItems: 'flex-end', gap: 7, marginTop: 7 },
  categoryChip: {
    minWidth: 78,
    alignItems: 'center',
    backgroundColor: COLORS.background + 'E8',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  categoryText: { color: COLORS.text, fontSize: 10, fontWeight: '700' },
  categoryTextActive: { color: COLORS.background },
  actionButton: {
    backgroundColor: COLORS.background + 'ED',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    minWidth: 78,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
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
  selectedSheet: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    right: 10,
    backgroundColor: COLORS.background + 'F8',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 17,
    paddingTop: 9,
    paddingBottom: 15,
    maxHeight: '48%',
  },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, backgroundColor: COLORS.muted, marginBottom: 12 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeSheet: { color: COLORS.muted, fontSize: 18, paddingHorizontal: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 12 },
  scoreValue: { color: COLORS.accent, fontSize: 30, fontWeight: '900' },
  scoreCaption: { flex: 1 },
  scoreLabel: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  facilityPills: { alignItems: 'flex-end', gap: 4 },
  facilityText: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  sheetSection: { color: COLORS.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 8, marginBottom: 8 },
  sheetMuted: { color: COLORS.muted, fontSize: 9 },
  ratingLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ratingLineScore: { color: COLORS.text, fontSize: 10, fontWeight: '800' },
  detailsButton: { marginTop: 12, backgroundColor: COLORS.accent, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  detailsButtonText: { color: COLORS.background, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  ratingForm: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  formTitle: { color: COLORS.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  formHint: { color: COLORS.muted, fontSize: 10, marginTop: 5, marginBottom: 10 },
  formInput: { color: COLORS.text, backgroundColor: COLORS.background, borderColor: COLORS.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 12, marginBottom: 8 },
  scoreChoices: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scoreChoice: { flex: 1, height: 38, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  scoreChoiceActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  scoreChoiceText: { color: COLORS.text, fontSize: 14, fontWeight: '900' },
  scoreChoiceTextActive: { color: COLORS.background },
  submitButton: { backgroundColor: COLORS.accent, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  submitButtonText: { color: COLORS.background, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  secondaryDetailsButton: { alignItems: 'center', paddingVertical: 10, marginTop: 3 },
  secondaryDetailsText: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
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
