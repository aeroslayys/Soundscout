import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '@/constants/api';
import { ExternalLink } from '@/components/external-link';
import { useAppTheme } from '@/context/theme';

type VenueEvent = {
  id: string;
  title: string;
  event_type: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  expected_crowd?: string | null;
  amplified_music?: boolean;
  time_zone?: string | null;
};

function formatEventDate(value: string, timeZone?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date to be announced';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', timeZone: timeZone || undefined,
  }).format(date);
}

export function VenueEvents({ venueId }: { venueId: string }) {
  const { colors } = useAppTheme();
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API_URL}/api/venues/${encodeURIComponent(venueId)}/events`)
      .then(async response => {
        if (!response.ok) throw new Error('Could not load venue announcements.');
        return response.json();
      })
      .then(data => { if (active) setEvents(Array.isArray(data.events) ? data.events : []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load announcements.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [venueId]);

  const styles = StyleSheet.create({
    sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 26, marginBottom: 13 },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
    title: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 7 },
    meta: { color: colors.accent, fontSize: 11, lineHeight: 17, marginBottom: 7 },
    body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    muted: { color: colors.muted, fontSize: 12, lineHeight: 19 },
    partnerCard: { backgroundColor: colors.surfaceLight, borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 18 },
    partnerTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 6 },
    partnerLink: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: 10 },
  });

  return (
    <View>
      <Text style={styles.sectionTitle}>Upcoming at this venue</Text>
      {loading ? (
        <View style={{ paddingVertical: 18 }}><ActivityIndicator color={colors.accent} /></View>
      ) : error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : events.length ? (
        events.map(event => (
          <View key={event.id} style={styles.card}>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.meta}>
              {formatEventDate(event.starts_at, event.time_zone)} · {event.expected_crowd ? event.expected_crowd.replace(/_/g, ' ') + ' crowd' : 'Crowd level unknown'}
            </Text>
            {event.description ? <Text style={styles.body}>{event.description}</Text> : null}
            {event.amplified_music ? <Text style={styles.body}>Amplified music expected</Text> : null}
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No upcoming events announced for this venue.</Text>
      )}

      <View style={styles.partnerCard}>
        <Text style={styles.partnerTitle}>Manage a venue on SoundScout?</Text>
        <Text style={styles.muted}>Venue partners can publish and update events and announcements from the web dashboard.</Text>
        <ExternalLink href={`${API_URL}/partner/partner.html`}>
          <Text style={styles.partnerLink}>OPEN VENUE PARTNER DASHBOARD ↗</Text>
        </ExternalLink>
      </View>
    </View>
  );
}
