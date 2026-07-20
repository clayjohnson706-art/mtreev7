import React, { useEffect } from "react";
import { View, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { useAuth } from "@/src/context/AuthContext";
import { getNextRoute } from "@/src/utils/nextRoute";

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 90 });
    opacity.value = withTiming(1, { duration: 600 });
    taglineOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
  }, []);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      router.replace(getNextRoute(user) as any);
    }, 2200);
    return () => clearTimeout(t);
  }, [loading, user, router]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

  return (
    <View style={styles.container} testID="splash-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={require("@/assets/images/gen_logo_a_constellation_v2_primary.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[styles.tagline, taglineStyle]}>Goal · Intention · Sacrifice</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.void, alignItems: "center", justifyContent: "center" },
  logoWrap: { alignItems: "center", justifyContent: "center" },
  logo: { width: 150, height: 150 * (1383 / 947) },
  tagline: {
    color: COLORS.gray1,
    fontSize: 12,
    letterSpacing: 3,
    marginTop: 20,
    textTransform: "uppercase",
  },
});
