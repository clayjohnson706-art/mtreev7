import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop, Path, G } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import { DeityStone } from "@/src/components/DeityStone";

const AnimatedView = Animated.createAnimatedComponent(View);

// Large deity hero for the home screen. Replaces the tree.
// - Halo of light (multi-layer glow) that breathes.
// - Rays of soft light emanating from behind the deity stone.
// - Deity stone (petroglyph) at center, oversized.
// - Optional deity name below.
export default function DeityHero({
  deityName,
  color,
  glow,
  size = 260,
  showName = true,
  glowActive = true,
}: {
  deityName: string;
  color: string;
  glow?: string;
  size?: number;
  showName?: boolean;
  glowActive?: boolean;
}) {
  const outer = useSharedValue(0);
  const mid = useSharedValue(0);
  const inner = useSharedValue(0);
  const rayRot = useSharedValue(0);

  React.useEffect(() => {
    outer.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
    mid.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    inner.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    rayRot.value = withRepeat(withTiming(1, { duration: 40000, easing: Easing.linear }), -1, false);
  }, []);

  const outerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(outer.value, [0, 1], [0.08, 0.16]),
    transform: [{ scale: interpolate(outer.value, [0, 1], [0.95, 1.05]) }],
  }));
  const midStyle = useAnimatedStyle(() => ({
    opacity: interpolate(mid.value, [0, 1], [0.25, 0.4]),
    transform: [{ scale: interpolate(mid.value, [0, 1], [0.97, 1.03]) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(inner.value, [0, 1], [0.55, 0.85]),
  }));
  const raysStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rayRot.value * 360}deg` }],
    opacity: 0.22,
  }));

  const stoneSize = size * 0.55;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {glowActive && (
        <>
          {/* Layer 4: Outer atmospheric */}
          <AnimatedView
            style={[
              styles.halo,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
              },
              outerStyle,
            ]}
          />
          {/* Layer 3: Slow rotating light rays */}
          <AnimatedView style={[{ position: "absolute", width: size, height: size }, raysStyle]}>
            <Svg width={size} height={size} viewBox="0 0 200 200">
              <Defs>
                <RadialGradient id="rayGrad" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={color} stopOpacity="0.6" />
                  <Stop offset="100%" stopColor={color} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <G>
                {Array.from({ length: 12 }).map((_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  const x1 = 100 + Math.cos(a) * 30;
                  const y1 = 100 + Math.sin(a) * 30;
                  const x2 = 100 + Math.cos(a) * 95;
                  const y2 = 100 + Math.sin(a) * 95;
                  const x3 = 100 + Math.cos(a + 0.08) * 95;
                  const y3 = 100 + Math.sin(a + 0.08) * 95;
                  return (
                    <Path
                      key={i}
                      d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} Z`}
                      fill="url(#rayGrad)"
                    />
                  );
                })}
              </G>
            </Svg>
          </AnimatedView>
          {/* Layer 2: Mid bloom */}
          <AnimatedView
            style={[
              styles.halo,
              {
                width: size * 0.72,
                height: size * 0.72,
                borderRadius: size / 2,
                backgroundColor: color,
              },
              midStyle,
            ]}
          />
          {/* Layer 1: Edge glow ring */}
          <AnimatedView
            style={[
              styles.halo,
              {
                width: size * 0.6,
                height: size * 0.6,
                borderRadius: size / 2,
                borderWidth: 1.5,
                borderColor: color,
                backgroundColor: "transparent",
                shadowColor: color,
                shadowRadius: 30,
                shadowOpacity: 1,
                shadowOffset: { width: 0, height: 0 },
                elevation: 20,
              },
              innerStyle,
            ]}
          />
        </>
      )}
      {/* Deity stone */}
      <View style={{ position: "absolute" }}>
        <DeityStone
          deityName={deityName}
          color={color}
          glow={glow}
          size={stoneSize}
          glowIntensity={1.5}
          glowOn={glowActive}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: "absolute" },
});
