import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Icon sf="map" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add-venue">
        <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" />
        <NativeTabs.Trigger.Label>Venues</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="my-ratings">
        <NativeTabs.Trigger.Icon sf="star" />
        <NativeTabs.Trigger.Label>My Ratings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
