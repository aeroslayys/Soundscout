import { DarkTheme, DefaultTheme, ThemeProvider as ExpoThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth';
import { ThemeProvider, useAppTheme } from '@/context/theme';

SplashScreen.preventAutoHideAsync();

function AppNavigation() {
  const { token, ready } = useAuth();
  const { resolved } = useAppTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inAuthScreen = segments[0] === 'auth';
    if (!token && !inAuthScreen) {
      router.replace('/auth' as never);
    } else if (token && inAuthScreen) {
      router.replace('/(tabs)' as never);
    }
  }, [token, ready, segments, router]);

  return (
    <>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="venue/[id]" />
      </Stack>
    </>
  );
}

function ThemedNavigation() {
  const { resolved } = useAppTheme();
  return (
    <ExpoThemeProvider value={resolved === 'dark' ? DarkTheme : DefaultTheme}>
      <AppNavigation />
    </ExpoThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemedNavigation />
      </ThemeProvider>
    </AuthProvider>
  );
}