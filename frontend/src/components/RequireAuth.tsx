import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";

// Guarantees the wrapped authenticated-only screen(s) are NEVER rendered without a valid
// session — closes the brief render-before-effect-redirect gap where protected content could
// otherwise flash on screen with `user === null` for a frame (e.g. right after a genuine
// logout, before AuthNavGuard's effect has finished navigating away). Renders a neutral loading
// state instead of the real content whenever there isn't a confirmed, loaded user.
//
// IMPORTANT: this component owns its OWN redirect-to-/auth fallback (below) rather than relying
// solely on the root-level AuthNavGuard. AuthNavGuard only reacts to a LIVE authenticated->null
// transition — it deliberately does nothing if the app is *already* unauthenticated when a
// protected screen is reached directly (e.g. pressing hardware/browser Back after a sign-out
// that already completed, a deep link, or a fresh session with no token at all landing straight
// on a protected route). Without its own fallback, this component would otherwise show its
// loading spinner FOREVER in exactly those cases. This makes every screen wrapped here
// self-sufficient: it can never get stuck showing protected content OR a permanent spinner.
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || user) return;
    router.dismissAll();
    router.replace("/auth");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={styles.loading} testID="require-auth-loading">
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLORS.void, alignItems: "center", justifyContent: "center" },
});
