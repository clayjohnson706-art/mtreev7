import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLORS, GOAL_CATEGORIES, SACRIFICE_CATEGORIES, CYCLE_OPTIONS, REMINDER_OPTIONS, LANGUAGES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Chip, FilledButton, Card } from "@/src/components/ui";
import LanguagePicker from "@/src/components/LanguagePicker";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";
import { rescheduleReminders, computeEvenReminderTimes } from "@/src/utils/notifications";
import { getCosmicEnergy } from "@/src/utils/cosmic";
import { getSpiritualMoonDay } from "@/src/utils/spiritual-moon";

const STEPS = ["goal", "sacrifice", "cycle", "reminders", "affirmation", "hustle", "fasting", "confirm"] as const;

function timeToDate(hhmm: string | null): Date {
  const d = new Date();
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
    const [h, m] = hhmm.split(":").map(Number);
    d.setHours(h); d.setMinutes(m);
  } else {
    d.setHours(22); d.setMinutes(0);
  }
  d.setSeconds(0); d.setMilliseconds(0);
  return d;
}
function dateToTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
function formatTime(hhmm: string | null): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}
// Resizes the custom times array to match `count`, seeding new slots with a sane even spread.
function resizeTimes(times: string[], count: number, busyStart: string | null, busyEnd: string | null): string[] {
  if (times.length === count) return times;
  if (times.length > count) return times.slice(0, count);
  const seed = computeEvenReminderTimes(count, busyStart, busyEnd).map(
    (t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`
  );
  return Array.from({ length: count }, (_, i) => times[i] ?? seed[i] ?? "09:00");
}

export default function ManifestSetup() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [goalCat, setGoalCat] = useState<string | null>(null);
  const [goalCustom, setGoalCustom] = useState("");
  const [goalDesc, setGoalDesc] = useState("");
  const [sacCat, setSacCat] = useState<string | null>(null);
  const [sacCustom, setSacCustom] = useState("");
  const [sacDesc, setSacDesc] = useState("");
  const [days, setDays] = useState<number>(21);
  const [reminders, setReminders] = useState(0);
  const [busyStart, setBusyStart] = useState<string | null>(user?.notification_busy_start ?? "22:00");
  const [busyEnd, setBusyEnd] = useState<string | null>(user?.notification_busy_end ?? "07:00");
  // Off by default (matches the account-level default) — when off, reminders fire normally
  // without avoiding any busy window, regardless of the busyStart/busyEnd values chosen below.
  const [busyHoursEnabled, setBusyHoursEnabled] = useState(!!user?.busy_hours_enabled);
  const [reminderMode, setReminderMode] = useState<"random" | "custom">("random");
  const [reminderTimes, setReminderTimes] = useState<string[]>([]);
  const [pickerFor, setPickerFor] = useState<"start" | "end" | number | null>(null);
  // Affirmations default to ON for every new manifestation — users can still turn them off.
  const [affirmationOn, setAffirmationOn] = useState(true);
  const [affirmLang, setAffirmLang] = useState<string>(user?.affirmation_language ?? "english");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [hustle, setHustle] = useState(false);
  const [fasting, setFasting] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPremium = !!user?.is_premium;

  const canProceed = useMemo(() => {
    switch (STEPS[step]) {
      case "goal": return !!goalCat && (goalCat !== "custom" || goalCustom.trim().length > 0);
      case "sacrifice": return !!sacCat && (sacCat !== "custom" || sacCustom.trim().length > 0);
      case "cycle": return days >= 3 && days <= 365;
      default: return true;
    }
  }, [step, goalCat, goalCustom, sacCat, sacCustom, days]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  // Back preserves all state (goal, sacrifice, cycle, etc.) because we never reset it.
  const back = () => step > 0 ? setStep(step - 1) : router.back();

  const selectReminderMode = (m: "random" | "custom") => {
    setReminderMode(m);
    if (m === "custom") setReminderTimes((t) => resizeTimes(t, reminders || 1, busyHoursEnabled ? busyStart : null, busyHoursEnabled ? busyEnd : null));
  };
  const selectReminderCount = (n: number) => {
    setReminders(n);
    if (reminderMode === "custom") setReminderTimes((t) => resizeTimes(t, n, busyHoursEnabled ? busyStart : null, busyHoursEnabled ? busyEnd : null));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const finalReminderTimes = reminderMode === "custom" ? reminderTimes.slice(0, reminders) : [];
      await api("/manifestations", {
        method: "POST",
        body: {
          goal_category: goalCat,
          goal_custom: goalCat === "custom" ? goalCustom : null,
          goal_description: goalDesc || null,
          sacrifice_category: sacCat,
          sacrifice_custom: sacCat === "custom" ? sacCustom : null,
          sacrifice_description: sacDesc || null,
          cycle_days: days,
          reminder_count: isPremium ? reminders : 0,
          reminder_mode: reminderMode,
          reminder_times: isPremium ? finalReminderTimes : [],
          affirmation_enabled: isPremium && affirmationOn,
          fasting_enabled: fasting,
          hustle_enabled: hustle,
          is_public: user?.is_public ?? true,
          cosmic_level_at_start: getCosmicEnergy(),
          moon_phase_at_start: getSpiritualMoonDay().name,
        },
      });
      // Also persist busy hours + affirmation language on user profile. Uses updateProfile()
      // (not a raw api() PATCH) so AuthContext's `user` state is updated immediately — otherwise
      // Home's affirmation fetch would use the stale pre-update language/reminder prefs on the
      // very first render after this screen.
      if (isPremium && reminders > 0) {
        await updateProfile({
          notification_count: reminders,
          notification_busy_start: busyStart,
          notification_busy_end: busyEnd,
          busy_hours_enabled: busyHoursEnabled,
          reminder_mode: reminderMode,
          reminder_times: finalReminderTimes,
        });
        const result = await rescheduleReminders(
          reminders,
          busyHoursEnabled ? busyStart : null,
          busyHoursEnabled ? busyEnd : null,
          reminderMode,
          finalReminderTimes
        );
        if (!result.scheduled && result.permission === "blocked") {
          Alert.alert(
            "Notifications Are Off",
            "Your reminder schedule is saved, but notifications are turned off for mTree in your device settings — open Settings to turn them back on so reminders can fire.",
            [{ text: "Later", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
          );
        }
      }
      if (isPremium && affirmationOn) {
        await updateProfile({ affirmation_language: affirmLang });
      }
      // Journey guidance is shown as an overlay ON the Home screen EVERY time a new
      // manifestation journey is started (not just the first ever) — triggered deterministically
      // via this navigation param so it only ever fires right here, never during login/
      // onboarding or a plain Home visit/reopen.
      router.replace({ pathname: "/(tabs)/home", params: { showJourneyIntro: "1" } });
    } finally { setBusy(false); }
  };

  const pickerValue = (): string | null => {
    if (pickerFor === "start") return busyStart;
    if (pickerFor === "end") return busyEnd;
    if (typeof pickerFor === "number") return reminderTimes[pickerFor] ?? "09:00";
    return null;
  };
  const applyPickedTime = (t: string) => {
    if (pickerFor === "start") setBusyStart(t);
    else if (pickerFor === "end") setBusyEnd(t);
    else if (typeof pickerFor === "number") {
      setReminderTimes((prev) => {
        const next = [...prev];
        next[pickerFor as number] = t;
        return next;
      });
    }
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setPickerFor(null);
    if (event.type === "set" && selected && pickerFor !== null) applyPickedTime(dateToTime(selected));
  };

  return (
    <View style={styles.container} testID="manifest-setup">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={back} testID="setup-back" hitSlop={16} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={COLORS.white} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <View style={styles.progress}>
              {STEPS.map((_, i) => (
                <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
              ))}
            </View>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
            {STEPS[step] === "goal" && (
              <View>
                <Text style={styles.stepTitle}>What do you want{"\n"}to manifest?</Text>
                <View style={styles.chipWrap}>
                  {GOAL_CATEGORIES.map((g) => (
                    <Chip
                      key={g.key}
                      testID={`goal-${g.key}`}
                      label={g.label}
                      emoji={g.emoji}
                      selected={goalCat === g.key}
                      onPress={() => setGoalCat(g.key)}
                    />
                  ))}
                </View>
                {goalCat === "custom" && (
                  <TextInput
                    testID="goal-custom-input"
                    value={goalCustom}
                    onChangeText={setGoalCustom}
                    placeholder="Describe your goal..."
                    placeholderTextColor={COLORS.gray2}
                    style={styles.input}
                  />
                )}
                <Text style={styles.label}>NOTES (Private)</Text>
                <TextInput
                  testID="goal-desc-input"
                  value={goalDesc}
                  onChangeText={setGoalDesc}
                  placeholder="Describe in your own words — only you see this"
                  placeholderTextColor={COLORS.gray2}
                  style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                  multiline
                />
              </View>
            )}

            {STEPS[step] === "sacrifice" && (
              <View>
                <Text style={styles.stepTitle}>What will you{"\n"}sacrifice?</Text>
                <View style={styles.chipWrap}>
                  {SACRIFICE_CATEGORIES.map((s) => (
                    <Chip
                      key={s.key}
                      testID={`sac-${s.key}`}
                      label={s.label}
                      emoji={s.emoji}
                      selected={sacCat === s.key}
                      onPress={() => setSacCat(s.key)}
                      color={COLORS.cyan}
                    />
                  ))}
                </View>
                {sacCat === "custom" && (
                  <TextInput
                    testID="sac-custom-input"
                    value={sacCustom}
                    onChangeText={setSacCustom}
                    placeholder="What will you give up?"
                    placeholderTextColor={COLORS.gray2}
                    style={styles.input}
                  />
                )}
              </View>
            )}

            {STEPS[step] === "cycle" && (
              <View>
                <Text style={styles.stepTitle}>How many days?</Text>
                <View style={{ gap: 12, marginTop: 20 }}>
                  {CYCLE_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c.days}
                      testID={`cycle-${c.days}`}
                      activeOpacity={0.85}
                      onPress={() => setDays(c.days)}
                    >
                      <Card style={{
                        ...styles.choiceCard,
                        borderWidth: 1,
                        borderColor: days === c.days ? COLORS.gold : "transparent",
                        backgroundColor: days === c.days ? COLORS.gold + "10" : COLORS.surface1,
                      }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{c.label}</Text>
                            <Text style={styles.cardSub} numberOfLines={1}>{c.desc}</Text>
                          </View>
                          {days === c.days && <Ionicons name="checkmark-circle" size={22} color={COLORS.gold} />}
                        </View>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {STEPS[step] === "reminders" && (
              <View>
                <Text style={styles.stepTitle}>Daily Reminders</Text>
                <Text style={styles.stepSub}>Gentle nudges to stay on your path.</Text>
                {!isPremium && (
                  <Card style={styles.lockCard}>
                    <Ionicons name="lock-closed" size={22} color={COLORS.gray1} />
                    <Text style={styles.lockText}>Reminders are a premium feature.</Text>
                    <TouchableOpacity onPress={() => router.push("/paywall")}>
                      <Text style={styles.upgradeLink}>Upgrade to unlock</Text>
                    </TouchableOpacity>
                  </Card>
                )}
                <Text style={styles.subLabel}>FREQUENCY (up to 10x/day)</Text>
                <View style={[styles.chipWrap, { opacity: isPremium ? 1 : 0.4 }]}>
                  {REMINDER_OPTIONS.map((n) => (
                    <Chip
                      key={n}
                      testID={`reminders-${n}`}
                      label={n === 0 ? "Off" : `${n}x per day`}
                      selected={reminders === n}
                      onPress={() => isPremium && selectReminderCount(n)}
                    />
                  ))}
                </View>

                {reminders > 0 && (
                  <>
                    <Text style={styles.subLabel}>SCHEDULE</Text>
                    <View style={[styles.busyRow, { opacity: isPremium ? 1 : 0.4 }]}>
                      <TouchableOpacity
                        testID="reminder-mode-random"
                        disabled={!isPremium}
                        onPress={() => selectReminderMode("random")}
                        style={[styles.modeBtn, reminderMode === "random" && styles.modeBtnActive]}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="shuffle" size={15} color={reminderMode === "random" ? COLORS.void : COLORS.gray1} />
                        <Text style={[styles.modeBtnText, reminderMode === "random" && styles.modeBtnTextActive]}>Random</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID="reminder-mode-custom"
                        disabled={!isPremium}
                        onPress={() => selectReminderMode("custom")}
                        style={[styles.modeBtn, reminderMode === "custom" && styles.modeBtnActive]}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="time" size={15} color={reminderMode === "custom" ? COLORS.void : COLORS.gray1} />
                        <Text style={[styles.modeBtnText, reminderMode === "custom" && styles.modeBtnTextActive]}>Custom Times</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.stepSub}>
                      {reminderMode === "random"
                        ? "Reminders fire at naturally spread random times, never during busy hours."
                        : "Pick the exact time for each reminder below."}
                    </Text>
                  </>
                )}

                {reminderMode === "custom" && reminders > 0 && isPremium && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {Array.from({ length: reminders }, (_, i) => (
                      <TouchableOpacity
                        key={i}
                        testID={`reminder-time-${i}`}
                        onPress={() => setPickerFor(i)}
                        style={styles.timeRow}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.timeRowLabel}>Reminder {i + 1}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.timeRowValue}>{formatTime(reminderTimes[i])}</Text>
                          <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.subLabel}>BUSY HOURS (DO NOT DISTURB)</Text>
                <TouchableOpacity
                  testID="busy-hours-toggle"
                  disabled={!isPremium || reminders === 0}
                  onPress={() => setBusyHoursEnabled(!busyHoursEnabled)}
                  activeOpacity={0.85}
                >
                  <Card style={{
                    ...styles.choiceCard,
                    borderWidth: 1,
                    borderColor: busyHoursEnabled ? COLORS.gold : "transparent",
                    opacity: (isPremium && reminders > 0) ? 1 : 0.4,
                  }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{busyHoursEnabled ? "Avoid Busy Hours" : "Busy Hours Off"}</Text>
                        <Text style={styles.stepSub} numberOfLines={1}>
                          {busyHoursEnabled ? "Reminders will skip the window below." : "Reminders can fire anytime."}
                        </Text>
                      </View>
                      <Ionicons name={busyHoursEnabled ? "toggle" : "toggle-outline"} size={30} color={busyHoursEnabled ? COLORS.gold : COLORS.gray2} />
                    </View>
                  </Card>
                </TouchableOpacity>
                <View style={[styles.busyRow, { marginTop: 12, opacity: (isPremium && reminders > 0 && busyHoursEnabled) ? 1 : 0.4 }]}>
                  <TouchableOpacity
                    testID="busy-start"
                    disabled={!isPremium || reminders === 0 || !busyHoursEnabled}
                    onPress={() => setPickerFor("start")}
                    style={styles.busyPill}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.busyLabel}>FROM</Text>
                    <Text style={styles.busyTime}>{formatTime(busyStart)}</Text>
                  </TouchableOpacity>
                  <View style={styles.busyArrow}>
                    <Ionicons name="arrow-forward" size={16} color={COLORS.gray2} />
                  </View>
                  <TouchableOpacity
                    testID="busy-end"
                    disabled={!isPremium || reminders === 0 || !busyHoursEnabled}
                    onPress={() => setPickerFor("end")}
                    style={styles.busyPill}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.busyLabel}>TO</Text>
                    <Text style={styles.busyTime}>{formatTime(busyEnd)}</Text>
                  </TouchableOpacity>
                </View>

                {/* Android inline time picker */}
                {Platform.OS === "android" && pickerFor !== null && (
                  <DateTimePicker
                    value={timeToDate(pickerValue())}
                    mode="time"
                    display="clock"
                    is24Hour={false}
                    onChange={onPickerChange}
                  />
                )}
                {/* iOS modal time picker */}
                {Platform.OS === "ios" && (
                  <Modal transparent visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
                    <View style={styles.iosPickerWrap}>
                      <View style={styles.iosPickerCard}>
                        <View style={styles.iosPickerHeader}>
                          <TouchableOpacity onPress={() => setPickerFor(null)}>
                            <Text style={{ color: COLORS.gray1, fontSize: 15 }}>Cancel</Text>
                          </TouchableOpacity>
                          <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "700" }}>
                            {pickerFor === "start" ? "Busy From" : pickerFor === "end" ? "Busy Until" : `Reminder ${typeof pickerFor === "number" ? pickerFor + 1 : ""}`}
                          </Text>
                          <TouchableOpacity onPress={() => setPickerFor(null)}>
                            <Text style={{ color: COLORS.gold, fontSize: 15, fontWeight: "700" }}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        <DateTimePicker
                          value={timeToDate(pickerValue())}
                          mode="time"
                          display="spinner"
                          onChange={(_, d) => { if (d) applyPickedTime(dateToTime(d)); }}
                          themeVariant="dark"
                          textColor={COLORS.white}
                        />
                      </View>
                    </View>
                  </Modal>
                )}
                {/* Web fallback: quick preset chips */}
                {Platform.OS === "web" && pickerFor !== null && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.subLabel}>QUICK PRESET</Text>
                    <View style={styles.chipWrap}>
                      {["06:00", "07:00", "08:00", "09:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "23:00", "00:00"].map((t) => (
                        <Chip
                          key={t}
                          label={formatTime(t)}
                          selected={pickerValue() === t}
                          onPress={() => applyPickedTime(t)}
                        />
                      ))}
                    </View>
                    <FilledButton label="Done" onPress={() => setPickerFor(null)} style={{ marginTop: 12 }} />
                  </View>
                )}
              </View>
            )}

            {STEPS[step] === "affirmation" && (
              <View>
                <Text style={styles.stepTitle}>Daily Affirmation</Text>
                {!isPremium && (
                  <Card style={styles.lockCard}>
                    <Ionicons name="lock-closed" size={22} color={COLORS.gray1} />
                    <Text style={styles.lockText}>Affirmations are premium.</Text>
                    <TouchableOpacity onPress={() => router.push("/paywall")}>
                      <Text style={styles.upgradeLink}>Upgrade to unlock</Text>
                    </TouchableOpacity>
                  </Card>
                )}
                <TouchableOpacity
                  disabled={!isPremium}
                  onPress={() => setAffirmationOn(!affirmationOn)}
                  activeOpacity={0.85}
                >
                  <Card style={{
                    ...styles.choiceCard,
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: affirmationOn ? COLORS.gold : "transparent",
                    opacity: isPremium ? 1 : 0.4,
                  }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{affirmationOn ? "Affirmations ON" : "Affirmations OFF"}</Text>
                      <Ionicons name={affirmationOn ? "toggle" : "toggle-outline"} size={30} color={affirmationOn ? COLORS.gold : COLORS.gray2} />
                    </View>
                  </Card>
                </TouchableOpacity>

                {affirmationOn && isPremium && (
                  <TouchableOpacity
                    testID="affirmation-language-row"
                    onPress={() => setShowLangPicker(true)}
                    activeOpacity={0.85}
                    style={{ marginTop: 12 }}
                  >
                    <Card>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View>
                          <Text style={styles.cardTitle}>Language</Text>
                          <Text style={styles.cardSub}>
                            {LANGUAGES.find((l) => l.code === affirmLang)?.label ?? "English"}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {STEPS[step] === "hustle" && (
              <View>
                <Text style={styles.stepTitle}>Link your{"\n"}daily hustle?</Text>
                <Text style={styles.stepSub}>
                  Consciously connect your daily work, effort, and habits to your goal. Every action becomes an offering to your intention.
                </Text>
                <TouchableOpacity testID="hustle-toggle" onPress={() => setHustle(!hustle)} activeOpacity={0.85}>
                  <Card style={{
                    ...styles.choiceCard,
                    marginTop: 20,
                    borderWidth: 1,
                    borderColor: hustle ? COLORS.gold : "transparent",
                  }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.cardTitle, { flex: 1, paddingRight: 12 }]} numberOfLines={1}>{hustle ? "Yes, I will link my hustle" : "Not linking hustle"}</Text>
                      <Ionicons name={hustle ? "toggle" : "toggle-outline"} size={30} color={hustle ? COLORS.gold : COLORS.gray2} />
                    </View>
                  </Card>
                </TouchableOpacity>
              </View>
            )}

            {STEPS[step] === "fasting" && (
              <View>
                <Text style={styles.stepTitle}>Will you fast{"\n"}during this journey?</Text>
                <Text style={styles.stepSub}>
                  Honor-based. When you feel hunger, remember your goal.
                </Text>
                <TouchableOpacity onPress={() => setFasting(!fasting)} activeOpacity={0.85}>
                  <Card style={{
                    ...styles.choiceCard,
                    marginTop: 20,
                    borderWidth: 1,
                    borderColor: fasting ? COLORS.gold : "transparent",
                  }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.cardTitle, { flex: 1, paddingRight: 12 }]} numberOfLines={1}>{fasting ? "Yes, I will fast" : "No fasting"}</Text>
                      <Ionicons name={fasting ? "toggle" : "toggle-outline"} size={30} color={fasting ? COLORS.gold : COLORS.gray2} />
                    </View>
                  </Card>
                </TouchableOpacity>
              </View>
            )}

            {STEPS[step] === "confirm" && (
              <View>
                <Text style={styles.stepTitle}>Ready to begin?</Text>
                <Card style={{ marginTop: 20, gap: 10 }}>
                  <SummaryRow label="GOAL" value={`${GOAL_CATEGORIES.find(g => g.key === goalCat)?.emoji} ${goalCat === "custom" ? goalCustom : GOAL_CATEGORIES.find(g => g.key === goalCat)?.label}`} />
                  <SummaryRow label="SACRIFICE" value={`${SACRIFICE_CATEGORIES.find(s => s.key === sacCat)?.emoji} ${sacCat === "custom" ? sacCustom : SACRIFICE_CATEGORIES.find(s => s.key === sacCat)?.label}`} />
                  <SummaryRow label="DURATION" value={`${days} days`} />
                  <SummaryRow label="REMINDERS" value={reminders > 0 ? `${reminders}x/day (${reminderMode === "custom" ? "Custom" : "Random"})` : "Off"} />
                  {isPremium && reminders > 0 && (
                    <SummaryRow label="BUSY HOURS" value={busyHoursEnabled ? `${formatTime(busyStart)} → ${formatTime(busyEnd)}` : "Off"} />
                  )}
                  <SummaryRow label="AFFIRMATION" value={affirmationOn ? `On (${LANGUAGES.find(l => l.code === affirmLang)?.label ?? "English"})` : "Off"} />
                  <SummaryRow label="HUSTLE LINKED" value={hustle ? "Yes ✓" : "No"} />
                  <SummaryRow label="FASTING" value={fasting ? "Yes ✓" : "No"} />
                </Card>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {STEPS[step] === "confirm" ? (
              <FilledButton
                testID="manifest-submit"
                label={busy ? "Starting..." : "Begin Manifestation ✦"}
                onPress={submit}
                disabled={busy}
              />
            ) : (
              <FilledButton
                testID="manifest-next"
                label="Continue →"
                onPress={next}
                disabled={!canProceed}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <LanguagePicker
        visible={showLangPicker}
        selected={affirmLang}
        onSelect={(code) => { setAffirmLang(code); setShowLangPicker(false); }}
        onClose={() => setShowLangPicker(false)}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "600", maxWidth: "60%" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 10 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingRight: 8 },
  backText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 6 },
  progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gray3 },
  progressDotActive: { backgroundColor: COLORS.gold, width: 16 },
  stepTitle: { color: COLORS.white, fontSize: 28, fontWeight: "900", lineHeight: 34, marginTop: 8 },
  stepSub: { color: COLORS.gray1, fontSize: 14, marginTop: 12, lineHeight: 20 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  input: {
    marginTop: 16, height: 56, borderRadius: 16, backgroundColor: COLORS.surface1,
    color: COLORS.white, fontSize: 15, paddingHorizontal: 18,
  },
  label: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  cardTitle: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  cardSub: { color: COLORS.gray1, fontSize: 12, marginTop: 4 },
  // Shared fixed footprint for every single-choice "toggle" card across the Cycle/Busy-Hours/
  // Affirmation/Hustle/Fasting steps, so the card's width/height/padding never visibly shifts
  // as the user taps "Continue" between steps, regardless of whether that step's card has a
  // subtitle line or not.
  choiceCard: { minHeight: 78, justifyContent: "center" },
  lockCard: { marginTop: 12, alignItems: "center", gap: 8, padding: 20 },
  lockText: { color: COLORS.gray1, fontSize: 13 },
  upgradeLink: { color: COLORS.gold, fontSize: 13, fontWeight: "700" },
  subLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 24, marginBottom: 6 },
  busyRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 10 },
  busyPill: {
    flex: 1, height: 66, borderRadius: 18, backgroundColor: COLORS.surface1,
    justifyContent: "center", paddingHorizontal: 18,
  },
  busyLabel: { color: COLORS.gray2, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  busyTime: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginTop: 4 },
  busyArrow: { width: 20, alignItems: "center" },
  modeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 46, borderRadius: 14, backgroundColor: COLORS.surface1,
  },
  modeBtnActive: { backgroundColor: COLORS.gold },
  modeBtnText: { color: COLORS.gray1, fontSize: 13.5, fontWeight: "700" },
  modeBtnTextActive: { color: COLORS.void },
  timeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: COLORS.surface1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  timeRowLabel: { color: COLORS.gray1, fontSize: 13.5, fontWeight: "600" },
  timeRowValue: { color: COLORS.white, fontSize: 14.5, fontWeight: "800" },
  iosPickerWrap: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  iosPickerCard: { backgroundColor: COLORS.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
});
