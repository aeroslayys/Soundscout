import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';

const API_URL = 'http://192.168.101.73:8082';
const C = { surface:'#252830', text:'#F4F4F5', muted:'#92959F', accent:'#B8F36B', border:'#30323A', danger:'#FF7474' };

export default function AudioCapture({ onAnalyzed }: { onAnalyzed: (db:number, score:number) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [startedAt,setStartedAt] = useState(0);

  const finish = async () => {
    try {
      await recorder.stop();
      const duration = Date.now() - startedAt;
      if (duration < 5000) {
        setMessage('Recording too short. Record for at least 5 seconds.');
        return;
      }
      if (!recorder.uri) throw new Error('Recording file was not created.');
      setBusy(true); setMessage('Analyzing ambient sound…');
      const form = new FormData();
      form.append('clip', { uri:recorder.uri, name:'soundscout-clip.m4a', type:'audio/mp4' } as any);
      const response = await fetch(`${API_URL}/api/audio/analyze`, { method:'POST', body:form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Audio analysis failed.');
      onAnalyzed(Number(data.mean_volume_dbfs),Number(data.suggested_score));
      setMessage(`Measured ${Number(data.mean_volume_dbfs).toFixed(1)} dBFS · suggested ${data.suggested_score}/5. Audio is not stored.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not analyze recording.');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (state.isRecording && state.durationMillis >= 10000) void finish();
  }, [state.isRecording,state.durationMillis]);

  const toggle = async () => {
    try {
      if (state.isRecording) { await finish(); return; }
      await setAudioModeAsync({ allowsRecording:true, playsInSilentMode:true });
      await recorder.prepareToRecordAsync();
      setStartedAt(Date.now());
      recorder.record();
      setMessage('Recording… minimum 5 seconds, maximum 10 seconds.');
    } catch (error) { Alert.alert('Microphone unavailable',error instanceof Error ? error.message : 'Could not start recording.'); }
  };

  return <View style={s.wrap}>
    <Pressable disabled={busy} onPress={toggle} style={[s.button,state.isRecording&&s.stop]}>
      {busy?<ActivityIndicator color={C.accent}/>:<Text style={s.buttonText}>{state.isRecording?'■ STOP RECORDING':'● RECORD 5–10s CLIP'}</Text>}
    </Pressable>
    {state.isRecording?<Text style={s.message}>{(state.durationMillis/1000).toFixed(1)}s recorded</Text>:null}
    {message?<Text style={s.message}>{message}</Text>:null}
  </View>;
}
const s=StyleSheet.create({wrap:{marginTop:12},button:{backgroundColor:C.surface,borderColor:C.accent,borderWidth:1,borderRadius:9,padding:12,alignItems:'center'},stop:{borderColor:C.danger},buttonText:{color:C.accent,fontSize:10,fontWeight:'900',letterSpacing:.7},message:{color:C.muted,fontSize:10,lineHeight:16,marginTop:7}});
