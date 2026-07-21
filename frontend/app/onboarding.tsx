import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions, ScrollView, NativeScrollEvent, NativeSyntheticEvent, TouchableOpacity, BackHandler, Platform, ToastAndroid } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

const { width } = Dimensions.get("window");

// One screen per core feature — Goals, Sacrifice, Daily Commitment, Hustle, Fasting, Affirmations.
const SLIDES = [
  {
    emoji: "🎯",
    color: COLORS.gold,
    title: "Set Your Goal",
    body: "Choose what you want to manifest — money, health, love, career, and 30+ more categories. Every ritual you complete is a step toward it.",
    sub: "Your Goal & Sacrifice are set once per cycle, so choose with intention.",
  },
  {
    emoji: "🔥",
    color: COLORS.cyan,
    title: "Choose Your Sacrifice",
    body: "Give something up to prove your commitment — a habit, a distraction, anything holding you back. The universe rewards those who sacrifice for what they seek.",
    sub: "Pick from dozens of sacrifice categories, or write your own.",
  },
  {
    emoji: "✋",
    color: COLORS.electric,
    title: "Daily Commitment",
    body: "Every day, hold the Manifest button to complete your ritual and grow your streak. Skip a day and your streak resets — discipline is the practice.",
    sub: "A few seconds a day is all it takes to stay in flow.",
  },
  {
    emoji: "💪",
    color: "#F5C542",
    title: "Link Your Hustle",
    body: "Consciously connect your daily work, habits, and effort to your intention. The task itself doesn't change — only the meaning you give it.",
    sub: "Every action becomes an offering toward your goal.",
  },
  {
    emoji: "🍽️",
    color: "#45B764",
    title: "Fasting, Honor-Based",
    body: "Commit to a fast that supports your journey. It isn't about restriction — it's about creating space for what you're inviting in.",
    sub: "Whenever hunger or craving arises, let it remind you of your goal.",
  },
  {
    emoji: "✦",
    color: "#A855F7",
    title: "Daily Affirmations",
    body: "Speak your intention into being with a personalized affirmation — matched to your goal and shown in the language of your choice, every day.",
    sub: "🔒 Premium Feature",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;

  // "Press back again to exit" — a repeated back press within EXIT_WINDOW_MS on the very
  // first slide closes the app; a single press elsewhere just steps back one slide, never
  // letting the hardware back button escape onboarding into the (unauthenticated) app.
  const EXIT_WINDOW_MS = 2000;
  const backPressedOnceRef = useRef(false);
  const toastOpacity = useSharedValue(0);
  const [toastText, setToastText] = useState("Press back again to exit");

  const showExitToast = useCallback(() => {
    if (Platform.OS === "android") {
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
    }
    setToastText("Press back again to exit");
    toastOpacity.value = withTiming(1, { duration: 150 });
    setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 300 });
    }, EXIT_WINDOW_MS - 200);
  }, [toastOpacity]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        const current = idxRef.current;
        if (current > 0) {
          const prev = current - 1;
          scrollRef.current?.scrollTo({ x: prev * width, animated: true });
          return true;
        }
        if (backPressedOnceRef.current) {
          BackHandler.exitApp();
          return true;
        }
        backPressedOnceRef.current = true;
        showExitToast();
        setTimeout(() => { backPressedOnceRef.current = false; }, EXIT_WINDOW_MS);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [showExitToast])
  );

  const toastStyle = useAnimatedStyle(() => ({ opacity: toastOpacity.value }));

  const goNext = async () => {
    if (idx < SLIDES.length - 1) {
      // Let onScroll (below) be the single source of truth for `idx` — it fires from the
      // native scroll animation triggered by scrollTo() exactly the same way it fires during a
      // manual swipe, so the dot indicator/title/background transition at the same visual pace
      // whether the user swipes or taps Next (previously this line also called setIdx()
      // immediately, making the tap path jump ahead of the still-animating scroll — glitchy).
      scrollRef.current?.scrollTo({ x: (idx + 1) * width, animated: true });
    } else {
      await updateProfile({ onboarding_done: true });
      // Subscriptions are fully free for now (no Google Play Billing account set up yet) — skip
      // straight past the paywall screen to where it would have sent a premium user anyway.
      // Nothing here is deleted: flip these two lines back to "/paywall" once billing is ready.
      router.replace("/deity");
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  const skip = async () => {
    await updateProfile({ onboarding_done: true });
    router.replace("/deity");
  };

  return (
    <View style={styles.container} testID="onboarding-screen">
      <AnimatedBackground deityColor={SLIDES[idx].color} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPressIn={skip} testID="onboarding-skip">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {SLIDES.map((s, i) => (
            <View key={i} style={[styles.slide, { width }]}>
              <View style={styles.visual}>
                <View style={[styles.badgeGlow, { backgroundColor: s.color + "22", shadowColor: s.color }]} />
                <View style={[styles.badge, { borderColor: s.color + "55", backgroundColor: s.color + "14" }]}>
                  <Text style={styles.badgeEmoji}>{s.emoji}</Text>
                </View>
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
              <Text style={styles.sub}>{s.sub}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.footer}>
          <FilledButton
            testID="onboarding-continue"
            label={idx === SLIDES.length - 1 ? "Continue" : "Next"}
            onPress={goNext}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          testID="onboarding-exit-toast"
          style={[styles.toast, toastStyle]}
        >
          <Text style={styles.toastText}>{toastText}</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 24, paddingTop: 8 },
  skip: { color: COLORS.gray2, fontSize: 12, letterSpacing: 1 },
  slide: { alignItems: "center", paddingHorizontal: 32 },
  visual: { height: 220, alignItems: "center", justifyContent: "center", marginTop: 20 },
  badgeGlow: {
    position: "absolute", width: 190, height: 190, borderRadius: 999,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 40, shadowOpacity: 1,
  },
  badge: {
    width: 140, height: 140, borderRadius: 999, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  badgeEmoji: { fontSize: 62 },
  title: { color: COLORS.white, fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: 30 },
  body: { color: COLORS.gray1, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 16 },
  sub: { color: COLORS.gray2, fontSize: 13, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gray3 },
  dotActive: { backgroundColor: COLORS.gold, width: 20 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  toast: {
    position: "absolute",
    bottom: 100,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  toastText: {
    backgroundColor: "#000000CC",
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
});
