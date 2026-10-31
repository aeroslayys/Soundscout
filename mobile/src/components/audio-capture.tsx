import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
const API_URL = 'http://192.168.101.73:8082';
const C = { surface:'#252830', text:'#F4F4F5', muted:'#92959F', accent:'#B8F36B', danger:'#FF7474' };
export default function AudioCapture({ onAnalyzed }: { onAnalyzed: (db:number, score:number) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [startedAt,setStartedAt] = useState(0);
  const finishing = useRef(false);
  const finish = async () => {
    if (finishing.current || !state.isRecording) return;
    finishing.current = true;
    try {
      await recorder.stop();
      if (Date.now() - startedAt < 5000) { setMessage('Recording too short. Record for at least 5 seconds.'); return; }
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording file was not created.');
      setBusy(true); setMessage('Analyzing ambient sound…');
      const response = await FileSystem.uploadAsync(API_URL + '/api/audio/analyze', uri, {
        httpMethod:'POST', uploadType:FileSystem.FileSystemUploadType.MULTIPART,
        fieldName:'clip', mimeType:'audio/mp4',
      });
      const data = JSON.parse(response.body);
      if (response.status < 200 || response.status >= 300) throw new Error(data.error || 'Audio analysis failed.');
      onAnalyzed(Number(data.mean_volume_dbfs),Number(data.suggested_score));
      setMessage('Measured ' + Number(data.mean_volume_dbfs).toFixed(1) + ' dBFS · suggested ' + data.suggested_score + '/5. Audio is not stored.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not analyze recording.'); }
    finally { setBusy(false); finishing.current = false; }
  };
  useEffect(() => { if (state.isRecording && state.durationMillis >= 10000) void finish(); }, [state.isRecording,state.durationMillis]);
  const toggle = async () => {
    try {
      if (state.isRecording) { await finish(); return; }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone permission required','Allow microphone access for Expo Go in Android Settings, then try again.'); return; }
      await setAudioModeAsync({ allowsRecording:true, playsInSilentMode:true });
      finishing.current = false;
      await recorder.prepareToRecordAsync();
      setStartedAt(Date.now());
      recorder.record();
      setMessage('Recording… automatically stops at 10 seconds.');
    } catch (error) { Alert.alert('Microphone unavailable',error instanceof Error ? error.message : 'Could not start recording.'); }
  };
  return <View style={s.wrap}>
    <Pressable disabled={busy} onPress={toggle} style={[s.button,state.isRecording&&s.stop]}>
      {busy?<ActivityIndicator color={C.accent}/>:<Text style={s.buttonText}>{state.isRecording?'■ STOP RECORDING':'● RECORD 5–10s CLIP'}</Text>}
    </Pressable>
    {state.isRecording?<Text style={s.message}>{(state.durationMillis/1000).toFixed(1)}s / 10s</Text>:null}
    {message?<Text style={s.message}>{message}</Text>:null}
  </View>;
}
<<<<<<< HEAD
const s=StyleSheet.create({wrap:{marginTop:12},button:{backgroundColor:C.accent,borderColor:C.accent,borderWidth:1,borderRadius:10,paddingVertical:15,paddingHorizontal:14,alignItems:'center',minHeight:48,justifyContent:'center'},stop:{backgroundColor:C.danger,borderColor:C.danger},buttonText:{color:'#101114',fontSize:11,fontWeight:'900',letterSpacing:.8},message:{color:C.muted,fontSize:10,lineHeight:16,marginTop:7}});
=======
const s=StyleSheet.create({wrap:{marginTop:12},button:{backgroundColor:C.accent,borderColor:C.accent,borderWidth:1,borderRadius:10,paddingVertical:15,paddingHorizontal:14,alignItems:'center',minHeight:48,justifyContent:'center'},stop:{backgroundColor:C.danger,borderColor:C.danger},buttonText:{color:'#101114',fontSize:11,fontWeight:'900',letterSpacing:.8},message:{color:C.muted,fontSize:10,lineHeight:16,marginTop:7}});
>>>>>>> de591b4 (Make audio recording action prominent in mobile)
