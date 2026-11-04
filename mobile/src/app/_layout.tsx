import { DarkTheme, DefaultTheme, ThemeProvider as ExpoThemeProvider, Stack, useRouter, useSegments, useLocalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/auth';
import { ThemeProvider, useAppTheme } from '@/context/theme';

SplashScreen.preventAutoHideAsync();

function AppNavigation() {
  const { token, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();

  useEffect(() => {
    if (!ready) return;

    const inAuthScreen = segments[0] === 'auth';
    const inWelcomeScreen = (segments[0] as string) === 'welcome';
    const destination = params.next === 'add-venue'
      ? '/(tabs)/add-venue'
      : '/(tabs)/map';

    if (!token && !inAuthScreen && !inWelcomeScreen) {
      router.replace('/welcome' as never);
      return;
    }

    if (token && (inAuthScreen || inWelcomeScreen)) {
      router.replace(destination as never);
    }
  }, [token, ready, segments, router, params.next]);

  return (
    <>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" />
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
