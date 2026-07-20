import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/src/theme";

const { width, height } = Dimensions.get("window");

// Static starfield for background
const STARS = Array.from({ length: 22 }).map((_, i) => ({
  x: Math.random() * width,
  y: Math.random() * height,
  d: 1500 + Math.random() * 2500,
  o: 0.25 + Math.random() * 0.35,
}));

function Blob({
  color,
  size,
  startX,
  startY,
  duration,
  opacity,
}: {
  color: string;
  size: number;
  startX: number;
  startY: number;
  duration: number;
  opacity: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX + Math.sin(t.value * Math.PI * 2) * 60 },
      { translateY: startY + Math.cos(t.value * Math.PI * 2) * 40 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function Star({ x, y, dur, opacity }: { x: number; y: number; dur: number; opacity: number }) {
  const o = useSharedValue(opacity);
  useEffect(() => {
    o.value = withRepeat(withTiming(opacity * 0.3, { duration: dur }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: 2,
          height: 2,
          borderRadius: 1,
          backgroundColor: "#ffffff",
        },
        style,
      ]}
    />
  );
}

export default function AnimatedBackground({ deityColor = COLORS.electric }: { deityColor?: string }) {
  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[COLORS.void, COLORS.bg, COLORS.void]}
        style={StyleSheet.absoluteFillObject}
      />
      <Blob color="#4E9AF1" size={420} startX={-100} startY={-50} duration={48000} opacity={0.06} />
      <Blob color="#A855F7" size={380} startX={width - 240} startY={height - 300} duration={54000} opacity={0.055} />
      <Blob color={deityColor} size={320} startX={width / 2 - 150} startY={height / 3} duration={62000} opacity={0.05} />
      {STARS.map((s, i) => (
        <Star key={i} x={s.x} y={s.y} dur={s.d} opacity={s.o} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.void,
  },
});
