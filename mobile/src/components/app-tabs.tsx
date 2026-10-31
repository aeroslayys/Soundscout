import { NativeTabs } from 'expo-router/native-tabs';
import { useAppTheme } from '@/context/theme';

export default function AppTabs() {
  const { colors } = useAppTheme();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.surfaceLight}
      tintColor="#8FCB70"
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Icon sf="map" md="map" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add-venue">
        <NativeTabs.Trigger.Icon sf="mappin.and.ellipse" md="add_location_alt" />
        <NativeTabs.Trigger.Label>Venues</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="my-ratings">
        <NativeTabs.Trigger.Icon sf="star" md="star" />
        <NativeTabs.Trigger.Label>My Ratings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
