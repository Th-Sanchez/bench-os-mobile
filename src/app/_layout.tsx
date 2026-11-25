import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { AppErrorFallback } from '@/components/ui/AppErrorFallback';
import { I18nProvider } from '@/i18n/I18nProvider';
import { PushNotificationsProvider } from '@/notifications/PushNotificationsContext';
import { PrintPreferencesProvider } from '@/settings/PrintPreferencesContext';
import {
  captureHandledException,
  initSentry,
  wrapRootComponent,
  wrapRouterErrorBoundary,
} from '@/observability/sentry';
import { colors } from '@/theme/tokens';
import { configureAlertDefaults } from '@/utils/configureAlertDefaults';

initSentry();
configureAlertDefaults();
void SplashScreen.preventAutoHideAsync();

export const ErrorBoundary = wrapRouterErrorBoundary(AppErrorFallback);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

function RootNavigator() {
  const { isAuthenticated, isHydrating } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isHydrating) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/workbench');
    }
  }, [isAuthenticated, isHydrating, segments, router]);

  if (isHydrating) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bgCanvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgCanvas } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="customers/[customerId]" />
      <Stack.Screen name="orders/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="orders/stale" />
      <Stack.Screen name="orders/[orderId]/items/[itemId]/index" />
      <Stack.Screen
        name="orders/[orderId]/items/[itemId]/deliver"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontError) {
      captureHandledException(fontError, { 'error.source': 'font_loading' });
    }
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <PrintPreferencesProvider>
            <AuthProvider>
              <PushNotificationsProvider>
                <StatusBar style="dark" />
                <RootNavigator />
              </PushNotificationsProvider>
            </AuthProvider>
          </PrintPreferencesProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default wrapRootComponent(RootLayout);
