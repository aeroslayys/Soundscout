import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { useAuth } from '@/context/auth';

const API_URL = 'http://192.168.101.73:8082';
const C = { bg:'#101114', surface:'#1B1D22', text:'#F4F4F5', muted:'#92959F', accent:'#B8F36B', border:'#30323A', danger:'#FF7474' };
const START: Region = { latitude:12.0022, longitude:79.8100, latitudeDelta:0.018, longitudeDelta:0.018 };
const CATEGORIES = ['cafe','restaurant','library','gym','coworking'];

export default function AddVenueScreen() {
  const { token } = useAuth();
  const [name,setName] = useState('');
  const [category,setCategory] = useState('cafe');
  const [access,setAccess] = useState(false);
  const [toilet,setToilet] = useState(false);
  const [coordinate,setCoordinate] = useState({ latitude:START.latitude, longitude:START.longitude });
  const [locationConfirmed,setLocationConfirmed] = useState(false);
  const [region,setRegion] = useState<Region>(START);
  const [query,setQuery] = useState('');
  const [suggestions,setSuggestions] = useState<any[]>([]);
  const [searching,setSearching] = useState(false);
  const [measuredDb,setMeasuredDb] = useState<number|null>(null);
  const [suggestedScore,setSuggestedScore] = useState(3);
  const [score,setScore] = useState(3);
  const [audioBusy,setAudioBusy] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const [status,setStatus] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const searchLocation = async () => {
    if (query.trim().length < 3) return;
    setSearching(true); setSuggestions([]); setStatus('');
    try {
      const res = await fetch(`${API_URL}/api/venues/search-location?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Location search failed.');
      setSuggestions(data);
      if (!data.length) setStatus('No matching places found.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Location search failed.'); }
    finally { setSearching(false); }
  };

  const analyzeRecording = async (uri: string) => {
    setAudioBusy(true); setStatus('Analyzing your 5–10 second recording…');
    try {
      const form = new FormData();
      form.append('clip', { uri, name:'soundscout-clip.m4a', type:'audio/mp4' } as any);
      const res = await fetch(`${API_URL}/api/audio/analyze`, { method:'POST', body:form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not analyze this recording.');
      setMeasuredDb(Number(data.mean_volume_dbfs));
      setSuggestedScore(Number(data.suggested_score));
      setScore(Number(data.suggested_score));
      setStatus(`Measured ${Number(data.mean_volume_dbfs).toFixed(1)} dBFS · suggested ${data.suggested_score}/5 (${['','Loud','Lively','Moderate','Calm','Silent'][data.suggested_score]}). The audio itself is not stored.`);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Audio analysis failed. You can still rate manually.'); }
    finally { setAudioBusy(false); }
  };

  const toggleRecording = async () => {
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (uri) await analyzeRecording(uri);
        return;
      }
      await setAudioModeAsync({ allowsRecording:true, playsInSilentMode:true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus('Recording… stop between 5 and 10 seconds.');
    } catch (e) { Alert.alert('Microphone unavailable', e instanceof Error ? e.message : 'Could not start recording.'); }
  };

  const submit = async () => {
    if (!token) return Alert.alert('Sign in required','Please sign in before adding a venue.');
    if (!name.trim()) return Alert.alert('Venue name required','Enter the venue name.');
    if (!locationConfirmed) return Alert.alert('Location required','Search for the venue, then tap the map or drag the pin to confirm its exact location.');
    if (measuredDb === null && score < 1) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/venues`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          name:name.trim(), category, lat:coordinate.latitude, lng:coordinate.longitude,
          score, access, toilet, measured_db:measuredDb, had_audio_clip:measuredDb !== null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit venue.');
      Alert.alert('Venue submitted','Your venue and first rating have been submitted for admin approval. It will appear on the public map after approval.');
      setName(''); setCategory('cafe'); setAccess(false); setToilet(false); setMeasuredDb(null); setScore(3); setStatus('');
    } catch (e) { Alert.alert('Submission failed',e instanceof Error ? e.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="light-content" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.eyebrow}>CONTRIBUTE TO SOUNDSCOUT</Text>
      <Text style={s.title}>Add a venue</Text>
      <Text style={s.subtitle}>Pin the exact spot, add its facilities and submit an initial quietness rating.</Text>

      <Text style={s.label}>VENUE NAME</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Auroville Bakery" placeholderTextColor={C.muted} style={s.input} />

      <Text style={s.label}>CATEGORY</Text>
      <View style={s.chips}>{CATEGORIES.map(item=><Pressable key={item} onPress={()=>setCategory(item)} style={[s.chip,category===item&&s.chipActive]}><Text style={[s.chipText,category===item&&s.chipTextActive]}>{item.toUpperCase()}</Text></Pressable>)}</View>

      <Text style={s.label}>FIND THE LOCATION</Text>
      <View style={s.searchRow}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={searchLocation} placeholder="Search address or venue" placeholderTextColor={C.muted} style={[s.input,{flex:1,marginTop:0}]} />
        <Pressable style={s.searchButton} onPress={searchLocation} disabled={searching}>{searching?<ActivityIndicator color={C.bg}/>:<Text style={s.searchText}>SEARCH</Text>}</Pressable>
      </View>
      {suggestions.map((item,index)=><Pressable key={String(index)} style={s.suggestion} onPress={()=>{const next={latitude:Number(item.lat),longitude:Number(item.lng)};setCoordinate(next);setLocationConfirmed(true);const nextRegion={...next,latitudeDelta:0.004,longitudeDelta:0.004};setRegion(nextRegion);setSuggestions([]);setQuery(item.display_name);}}><Text style={s.suggestionText}>{item.display_name}</Text></Pressable>)}
      <Text style={s.hint}>Drag the pin to the entrance or tap the map to fine-tune its position.</Text>
      <View style={s.mapWrap}>
        <MapView style={s.map} region={region} onRegionChangeComplete={setRegion} onPress={e=>{setCoordinate(e.nativeEvent.coordinate);setLocationConfirmed(true);}} mapType="standard">
          <Marker coordinate={coordinate} draggable onDragEnd={e=>{setCoordinate(e.nativeEvent.coordinate);setLocationConfirmed(true);}} title="Venue location" description="Drag to adjust exact position" />
        </MapView>
      </View>
      <Text style={s.coords}>{coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}</Text>

      <Text style={s.label}>FACILITIES</Text>
      <View style={s.toggleRow}><View style={s.toggleCopy}><Text style={s.toggleTitle}>Wheelchair / step-free access</Text><Text style={s.hint}>Venue has accessible entry</Text></View><Switch value={access} onValueChange={setAccess} trackColor={{true:C.accent,false:C.border}} /></View>
      <View style={s.toggleRow}><View style={s.toggleCopy}><Text style={s.toggleTitle}>Restroom available</Text><Text style={s.hint}>Venue has a restroom</Text></View><Switch value={toilet} onValueChange={setToilet} trackColor={{true:C.accent,false:C.border}} /></View>

      <Text style={s.label}>INITIAL QUIETNESS RATING</Text>
      <Text style={s.hint}>1 = Loud · 2 = Lively · 3 = Moderate · 4 = Calm · 5 = Silent</Text>
      <View style={s.scores}>{[1,2,3,4,5].map(n=><Pressable key={n} onPress={()=>setScore(n)} style={[s.score,score===n&&s.scoreActive]}><Text style={[s.scoreText,score===n&&s.scoreTextActive]}>{n}</Text></Pressable>)}</View>

      <Text style={s.label}>RECORD AMBIENT SOUND (5–10 SECONDS)</Text>
      <Text style={s.hint}>The website analyzes average loudness (dBFS) and suggests a quietness score. The recording is analyzed temporarily; only the measured level is saved.</Text>
      <Pressable style={[s.recordButton,recorderState.isRecording&&s.recording]} onPress={toggleRecording} disabled={audioBusy}>
        <Text style={s.recordText}>{audioBusy?'ANALYZING…':recorderState.isRecording?'■ STOP RECORDING':'● RECORD SOUND'}</Text>
      </Pressable>
      {measuredDb!==null?<Text style={s.measurement}>✓ {measuredDb.toFixed(1)} dBFS · suggested {suggestedScore}/5 · manual rating {score}/5</Text>:null}
      {status?<Text style={s.status}>{status}</Text>:null}

      <Pressable style={s.submit} onPress={submit} disabled={submitting}><Text style={s.submitText}>{submitting?'SUBMITTING…':'SUBMIT VENUE + INITIAL RATING'}</Text></Pressable>
      <Text style={s.footer}>New venues are submitted as pending and appear publicly after admin approval.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},content:{padding:20,paddingBottom:50},eyebrow:{color:C.accent,fontSize:10,fontWeight:'900',letterSpacing:2,marginTop:12},title:{color:C.text,fontSize:31,fontWeight:'900',marginTop:9},subtitle:{color:C.muted,fontSize:13,lineHeight:20,marginTop:7,marginBottom:22},
 label:{color:C.accent,fontSize:10,fontWeight:'900',letterSpacing:1.4,marginTop:22,marginBottom:9},input:{color:C.text,backgroundColor:C.surface,borderColor:C.border,borderWidth:1,borderRadius:10,padding:13,marginTop:0,fontSize:13},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{borderWidth:1,borderColor:C.border,borderRadius:9,paddingHorizontal:10,paddingVertical:9},chipActive:{backgroundColor:C.accent,borderColor:C.accent},chipText:{color:C.muted,fontSize:9,fontWeight:'900'},chipTextActive:{color:C.bg},searchRow:{flexDirection:'row',gap:8,alignItems:'center'},searchButton:{backgroundColor:C.accent,borderRadius:10,paddingHorizontal:13,paddingVertical:14},searchText:{color:C.bg,fontSize:10,fontWeight:'900'},suggestion:{padding:10,backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.border},suggestionText:{color:C.text,fontSize:11},hint:{color:C.muted,fontSize:10,lineHeight:16,marginTop:7},mapWrap:{height:260,overflow:'hidden',borderRadius:14,borderWidth:1,borderColor:C.border,marginTop:10},map:{flex:1},coords:{color:C.muted,fontSize:10,fontVariant:['tabular-nums'],marginTop:8},toggleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:12,borderBottomWidth:1,borderColor:C.border},toggleCopy:{flex:1},toggleTitle:{color:C.text,fontSize:12,fontWeight:'700'},scores:{flexDirection:'row',gap:8,marginTop:12},score:{flex:1,height:43,alignItems:'center',justifyContent:'center',backgroundColor:C.surface,borderRadius:10,borderWidth:1,borderColor:C.border},scoreActive:{backgroundColor:C.accent,borderColor:C.accent},scoreText:{color:C.text,fontSize:15,fontWeight:'900'},scoreTextActive:{color:C.bg},recordButton:{backgroundColor:C.surface,borderWidth:1,borderColor:C.accent,borderRadius:10,padding:14,alignItems:'center',marginTop:12},recording:{backgroundColor:'#3A2020',borderColor:C.danger},recordText:{color:C.accent,fontSize:11,fontWeight:'900',letterSpacing:1},measurement:{color:C.accent,fontSize:11,fontWeight:'800',marginTop:10},status:{color:C.muted,fontSize:10,lineHeight:16,marginTop:8},submit:{backgroundColor:C.accent,borderRadius:11,padding:16,alignItems:'center',marginTop:26},submitText:{color:C.bg,fontSize:10,fontWeight:'900',letterSpacing:.7},footer:{color:C.muted,fontSize:10,lineHeight:16,textAlign:'center',marginTop:12}
});