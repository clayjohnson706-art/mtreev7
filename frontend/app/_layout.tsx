import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";
import { notificationsAvailable } from "@/src/utils/notifications";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Tapping a daily ritual reminder notification opens a calming popup before Home —
  // handles both the app-already-running case and cold start (app opened via the tap).
  // Local notifications are a native-only feature (not supported on web, and unavailable in
  // Expo Go on Android per notificationsAvailable()) — fully functional in a real build.
  useEffect(() => {
    if (Platform.OS === "web" || !notificationsAvailable()) return;
    let sub: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require("expo-notifications");
      const openIfRitualReminder = (data: any) => {
        if (data?.type === "ritual-reminder") router.push("/ritual-reminder");
      };
      sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        openIfRitualReminder(response.notification.request.content.data);
      });
      Notifications.getLastNotificationResponseAsync()
        .then((response: any) => {
          if (response) openIfRitualReminder(response.notification.request.content.data);
        })
        .catch(() => {});
    } catch {}
    return () => sub?.remove();
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.void }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.void} />
            <Stack
              initialRouteName="index"
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.void } }}
            >
              {/* Explicit initial route — cold start must always land on the splash screen
                  (which then decides auth/onboarding/home), never directly on any other screen. */}
              <Stack.Screen name="index" />
              {/* Mandatory setup screens — disable the iOS interactive swipe-back gesture so it
                  can't bypass onboarding the same way the Android hardware back button could
                  (handled via BackHandler inside each screen). */}
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
            </Stack>
          </BottomSheetModalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
