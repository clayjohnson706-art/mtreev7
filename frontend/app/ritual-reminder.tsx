import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { DeityStone } from "@/src/components/DeityStone";
import { Card, FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/utils/api";

// Shown only when the user has no active manifestation — otherwise this card always shows
// their real Goal, Sacrifice, and (if enabled) current Affirmation.
const FALLBACK_MESSAGE = "Breathe. Bring your goal to mind. Complete today's ritual.";

// One short, calming line of guidance shown above a REAL affirmation only.
const INSTRUCTION = "Pause for a breath, then speak these words as truth:";

// A short, sacrifice-focused nudge — reinforces the commitment without repeating the
// affirmation. Rotates daily so it doesn't feel stale on repeat visits.
const SACRIFICE_REMINDER_LINES = [
  "Don't give up on your sacrifice — every day you hold on, you grow stronger.",
  "Stay true to your promise. Consistency matters more than motivation.",
  "This is the hard part that makes the goal worth it. Keep going.",
];

type ActiveManifestation = {
  goal_category?: string;
  goal_custom?: string | null;
  sacrifice_category?: string;
  sacrifice_custom?: string | null;
  affirmation_enabled?: boolean;
} | null;

export default function RitualReminder() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveManifestation>(null);
  const [affirmationText, setAffirmationText] = useState<string | null>(null);

  const deity = DEITIES.find((d) => d.id === user?.deity_id) || DEITIES[0];
  const sacrificeLine = SACRIFICE_REMINDER_LINES[new Date().getDate() % SACRIFICE_REMINDER_LINES.length];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await api<ActiveManifestation>("/manifestations/active");
        if (cancelled) return;
        setActive(m);
        if (m?.goal_category && m?.affirmation_enabled) {
          const lang = user?.affirmation_language || "english";
          const a = await api<any>(`/affirmations/${m.goal_category}?language=${lang}`);
          if (!cancelled && a?.text) setAffirmationText(a.text);
        }
      } catch {
        // Keep the fallback state — never leave the card blank.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.affirmation_language]);

  const dismiss = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/home");
    } catch {
      router.replace("/(tabs)/home");
    }
  };

  const goalLabel = active?.goal_category
    ? active.goal_category === "custom"
      ? (active.goal_custom || "Custom")
      : GOAL_CATEGORIES.find((g) => g.key === active.goal_category)?.label
    : null;
  const goalEmoji = GOAL_CATEGORIES.find((g) => g.key === active?.goal_category)?.emoji ?? "🎯";
  const sacrificeLabel = active?.sacrifice_category
    ? active.sacrifice_category === "custom"
      ? (active.sacrifice_custom || "Custom")
      : SACRIFICE_CATEGORIES.find((s) => s.key === active.sacrifice_category)?.label
    : null;
  const sacrificeEmoji = SACRIFICE_CATEGORIES.find((s) => s.key === active?.sacrifice_category)?.emoji ?? "🔥";

  return (
    <View style={styles.container} testID="ritual-reminder-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Card style={styles.card}>
            <LinearGradient
              colors={[deity.glow ?? COLORS.goldGlow, COLORS.surface1]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <DeityStone deityName={deity.name} color={deity.color} glow={deity.glow} size={64} glowIntensity={1.1} />
            <Text style={styles.title}>Time For Your Ritual</Text>
            {loading ? (
              <ActivityIndicator color={deity.color} style={{ marginTop: 16 }} />
            ) : !goalLabel ? (
              <Text style={styles.message} testID="ritual-reminder-message">{FALLBACK_MESSAGE}</Text>
            ) : (
              <>
                <View style={styles.pillRow}>
                  <View style={styles.pill} testID="ritual-reminder-goal">
                    <Text style={styles.pillLabel}>GOAL</Text>
                    <Text style={styles.pillValue} numberOfLines={1}>{goalEmoji} {goalLabel}</Text>
                  </View>
                  <View style={styles.pill} testID="ritual-reminder-sacrifice">
                    <Text style={styles.pillLabel}>SACRIFICE</Text>
                    <Text style={styles.pillValue} numberOfLines={1}>{sacrificeEmoji} {sacrificeLabel}</Text>
                  </View>
                </View>
                {affirmationText && (
                  <>
                    <Text style={styles.instruction}>{INSTRUCTION}</Text>
                    <Text style={styles.message} testID="ritual-reminder-message">{affirmationText}</Text>
                  </>
                )}
                <Text style={styles.supportive} testID="ritual-reminder-sacrifice-line">{sacrificeLine}</Text>
              </>
            )}
            <FilledButton
              testID="ritual-reminder-begin"
              label="OK"
              onPress={dismiss}
              style={{ marginTop: 24, alignSelf: "stretch" }}
            />
          </Card>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: 0.3, marginTop: 14 },
  pillRow: { flexDirection: "row", gap: 10, marginTop: 18, alignSelf: "stretch" },
  pill: {
    flex: 1,
    backgroundColor: "#00000030",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pillLabel: { color: COLORS.gray2, fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2 },
  pillValue: { color: COLORS.white, fontSize: 13.5, fontWeight: "700", marginTop: 4 },
  instruction: {
    color: COLORS.gray1,
    fontSize: 13,
    textAlign: "center",
    marginTop: 18,
    lineHeight: 19,
  },
  message: {
    color: COLORS.white,
    fontSize: 16,
    fontStyle: "italic",
    fontWeight: "600",
    lineHeight: 24,
    textAlign: "center",
    marginTop: 10,
  },
  supportive: {
    color: COLORS.gray2,
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});
