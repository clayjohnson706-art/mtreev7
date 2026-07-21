import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";

// Guarantees the wrapped authenticated-only screen(s) are NEVER rendered without a valid
// session — closes the brief render-before-effect-redirect gap where protected content could
// otherwise flash on screen with `user === null` for a frame (e.g. right after a genuine
// logout, before AuthNavGuard's effect has finished navigating away). Renders a neutral loading
// state instead of the real content whenever there isn't a confirmed, loaded user.
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
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
