import React, { useRef } from "react";
import { ViewStyle, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Swipe navigation wrapper — live 1:1 finger tracking + spring physics for an effortless,
// native-feeling swipe between tabs. Order: home → wall → me
const ORDER: Array<"home" | "wall" | "me"> = ["home", "wall", "me"];
const { width: SCREEN_W } = Dimensions.get("window");
const EXIT_DISTANCE = SCREEN_W * 0.3;
const ENTER_OFFSET = SCREEN_W * 0.22;
// Snappier, more decisive settle (higher stiffness/damping ratio ≈0.98 — barely any overshoot)
// than before, which felt slightly "sticky"/wobbly on snap-back.
const SPRING = { damping: 26, stiffness: 280, mass: 0.6 };

// Plain in-memory module variable instead of AsyncStorage — this is purely a same-session
// visual hint ("which tab did I just come from, to pick an enter offset direction") and does
// NOT need persistence across app restarts. Reading/writing AsyncStorage on every single tab
// focus was async (a real bridge round-trip), so the screen would render at translateX=0 for a
// frame or two BEFORE the effect's promise resolved and snapped it to the enter offset — a
// visible flash/glitch on every tab switch. A synchronous module variable removes that gap.
let lastTab: "home" | "wall" | "me" | "" = "";

export default function SwipeNav({
  screen,
  children,
  style,
}: {
  screen: "home" | "wall" | "me";
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const navigation = useNavigation();
  const translateX = useSharedValue(0);
  // Hard lock against duplicate/overlapping navigation actions: without this, a fast flick
  // followed by another swipe before the first tab switch has actually completed could fire a
  // SECOND router action while the navigator is still mid-transition from the first — the kind
  // of overlapping/duplicate navigation dispatch that can leave React Navigation's stack in an
  // inconsistent state. Released the moment this screen (or the destination one) next gains
  // focus, with a short timeout fallback as a safety net.
  const isNavigatingRef = useRef(false);

  // Tab screens stay mounted after their first visit (bottom tabs just toggle visibility),
  // so entering with an offset + spring-to-0 on every focus keeps the transition feeling
  // continuous with whatever swipe/exit direction the user came from. Fully synchronous now —
  // no async gap, so there's no intermediate frame rendered at the wrong position.
  useFocusEffect(
    React.useCallback(() => {
      isNavigatingRef.current = false; // this screen is now genuinely focused — release the lock.
      const prevIdx = ORDER.indexOf(lastTab as any);
      const currIdx = ORDER.indexOf(screen);
      const fromX = lastTab && prevIdx !== -1 && prevIdx !== currIdx ? (currIdx > prevIdx ? ENTER_OFFSET : -ENTER_OFFSET) : 0;
      translateX.value = fromX;
      translateX.value = withSpring(0, SPRING);
      lastTab = screen;
    }, [screen])
  );

  const idx = ORDER.indexOf(screen);
  const nextTab = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const prevTab = idx > 0 ? ORDER[idx - 1] : null;

  const goTo = (t: "home" | "wall" | "me") => {
    if (isNavigatingRef.current) return; // a switch is already in flight — ignore duplicates.
    isNavigatingRef.current = true;
    // Use the LOCAL tabs navigator (same object/mechanism the tab bar's own onPress uses)
    // instead of the global router with an absolute path — guarantees this can only ever
    // switch tabs within the existing Tabs navigator and can never push a stray duplicate
    // entry onto the root stack, however rapidly/repeatedly it's called.
    (navigation as any).navigate(t);
    // Safety-net release in case focus doesn't fire promptly for some reason (e.g. navigating
    // toward a tab that's already focused) — never leave the gesture permanently locked out.
    setTimeout(() => { isNavigatingRef.current = false; }, 600);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      if (isNavigatingRef.current) return; // a switch is already committed — ignore further drag.
      // Live finger-follow with rubber-band resistance at the edges (no next/prev tab).
      let tx = e.translationX;
      if (tx < 0 && !nextTab) tx *= 0.3;
      if (tx > 0 && !prevTab) tx *= 0.3;
      translateX.value = tx;
    })
    .onEnd((e) => {
      if (isNavigatingRef.current) return; // ignore — a previous swipe's switch is still resolving.
      const { translationX, velocityX } = e;
      if ((translationX < -70 || velocityX < -700) && nextTab) {
        // Let the slide-out animation actually FINISH before switching tabs — navigating in
        // parallel with the animation could cut it short the instant the tab-bar toggles the
        // outgoing screen's visibility, which read as a stutter/jank on swipe.
        translateX.value = withTiming(-EXIT_DISTANCE, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(goTo)(nextTab);
        });
      } else if ((translationX > 70 || velocityX > 700) && prevTab) {
        translateX.value = withTiming(EXIT_DISTANCE, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(goTo)(prevTab);
        });
      } else {
        translateX.value = withSpring(0, SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
