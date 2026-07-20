import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Switch, Platform, ScrollView, Alert, Linking, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLORS, REMINDER_OPTIONS } from "@/src/theme";
import { Chip, FilledButton } from "@/src/components/ui";
import { api } from "@/src/utils/api";
import { rescheduleReminders, computeEvenReminderTimes, getNotificationPermissionState, requestNotificationPermissions } from "@/src/utils/notifications";

type PickerTarget = "start" | "end" | number | null;

function timeToDate(hhmm: string | null | undefined): Date {
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
function formatTime(hhmm: string | null | undefined): string {
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

type Props = {
  visible: boolean;
  onClose: () => void;
  manifestationId: string;
  initialCount: number;
  initialBusyStart: string | null | undefined;
  initialBusyEnd: string | null | undefined;
  initialBusyHoursEnabled?: boolean;
  initialMode?: string;
  initialTimes?: string[];
  onSaved: () => void;
};

export default function ReminderCenter({
  visible, onClose, manifestationId, initialCount, initialBusyStart, initialBusyEnd,
  initialBusyHoursEnabled, initialMode, initialTimes, onSaved,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(windowHeight * 0.88);
  const [enabled, setEnabled] = useState(initialCount > 0);
  const [count, setCount] = useState(initialCount > 0 ? initialCount : 3);
  const [busyStart, setBusyStart] = useState<string | null>(initialBusyStart ?? "22:00");
  const [busyEnd, setBusyEnd] = useState<string | null>(initialBusyEnd ?? "07:00");
  // Off by default — when off, reminders fire normally without avoiding any busy window,
  // regardless of whatever busyStart/busyEnd times are stored below.
  const [busyHoursEnabled, setBusyHoursEnabled] = useState(!!initialBusyHoursEnabled);
  const [mode, setMode] = useState<"random" | "custom">((initialMode as "random" | "custom") ?? "random");
  const [times, setTimes] = useState<string[]>(initialTimes && initialTimes.length ? initialTimes : []);
  const [pickerFor, setPickerFor] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  // "unknown" until checked; "blocked" = OS-denied with no more prompting allowed (Settings only).
  const [permBlocked, setPermBlocked] = useState(false);

  // Resync local state to latest props whenever the sheet is (re)opened.
  React.useEffect(() => {
    if (visible) {
      setEnabled(initialCount > 0);
      setCount(initialCount > 0 ? initialCount : 3);
      setBusyStart(initialBusyStart ?? "22:00");
      setBusyEnd(initialBusyEnd ?? "07:00");
      setBusyHoursEnabled(!!initialBusyHoursEnabled);
      setMode((initialMode as "random" | "custom") ?? "random");
      setTimes(initialTimes && initialTimes.length ? initialTimes : []);
      getNotificationPermissionState().then((s) => setPermBlocked(s === "blocked"));
    }
  }, [visible, initialCount, initialBusyStart, initialBusyEnd, initialBusyHoursEnabled, initialMode, initialTimes]);

  const selectMode = (m: "random" | "custom") => {
    setMode(m);
    if (m === "custom") setTimes((t) => resizeTimes(t, count, busyHoursEnabled ? busyStart : null, busyHoursEnabled ? busyEnd : null));
  };
  const selectCount = (n: number) => {
    setCount(n);
    if (mode === "custom") setTimes((t) => resizeTimes(t, n, busyHoursEnabled ? busyStart : null, busyHoursEnabled ? busyEnd : null));
  };

  // Turning reminders ON is the clear, contextual moment to ask for notification permission —
  // never prompted before this. If already blocked (denied twice / "don't ask again"), we show
  // an inline "Open Settings" notice instead of dead-ending the toggle.
  const onToggleEnabled = async (v: boolean) => {
    setEnabled(v);
    if (!v) return;
    const state = await getNotificationPermissionState();
    if (state === "blocked") { setPermBlocked(true); return; }
    if (state === "undetermined" || state === "denied") {
      Alert.alert(
        "Enable Notifications?",
        "Allow mTree to send you gentle daily ritual reminders at the times you choose.",
        [
          { text: "Not Now", style: "cancel" },
          {
            text: "Allow",
            onPress: async () => {
              const granted = await requestNotificationPermissions();
              setPermBlocked(!granted && (await getNotificationPermissionState()) === "blocked");
            },
          },
        ]
      );
    }
  };

  const effectiveCount = enabled ? count : 0;
  // null out the busy window entirely when the toggle is off, so downstream scheduling logic
  // never excludes any time slot — the stored busyStart/busyEnd values are preserved either way
  // so re-enabling the toggle later remembers the user's last-picked window.
  const effectiveBusyStart = busyHoursEnabled ? busyStart : null;
  const effectiveBusyEnd = busyHoursEnabled ? busyEnd : null;

  const save = async () => {
    setSaving(true);
    try {
      const finalTimes = mode === "custom" ? times.slice(0, effectiveCount) : [];
      await api("/profile", {
        method: "PATCH",
        body: {
          notification_count: effectiveCount,
          notification_busy_start: busyStart,
          notification_busy_end: busyEnd,
          busy_hours_enabled: busyHoursEnabled,
          reminder_mode: mode,
          reminder_times: finalTimes,
        },
      });
      await api(`/manifestations/${manifestationId}/reminders`, {
        method: "PATCH",
        body: { reminder_count: effectiveCount, reminder_mode: mode, reminder_times: finalTimes },
      });
      const result = await rescheduleReminders(effectiveCount, effectiveBusyStart, effectiveBusyEnd, mode, finalTimes);
      // Preferences are always saved above regardless of OS permission — only the actual
      // on-device scheduling depends on it. Surface a clear notice instead of silently doing
      // nothing when reminders are on but the OS has blocked notifications.
      if (effectiveCount > 0 && !result.scheduled && result.permission === "blocked") {
        setPermBlocked(true);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const pickerValue = (): string | null => {
    if (pickerFor === "start") return busyStart;
    if (pickerFor === "end") return busyEnd;
    if (typeof pickerFor === "number") return times[pickerFor] ?? "09:00";
    return null;
  };
  const applyPickedTime = (t: string) => {
    if (pickerFor === "start") setBusyStart(t);
    else if (pickerFor === "end") setBusyEnd(t);
    else if (typeof pickerFor === "number") {
      setTimes((prev) => {
        const next = [...prev];
        next[pickerFor] = t;
        return next;
      });
    }
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setPickerFor(null);
    if (event.type === "set" && selected && pickerFor !== null) applyPickedTime(dateToTime(selected));
  };

  const pickerLabel =
    pickerFor === "start" ? "Busy From" : pickerFor === "end" ? "Busy Until" : `Reminder ${typeof pickerFor === "number" ? pickerFor + 1 : ""}`;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Separate, absolutely-positioned dismiss layer BEHIND the sheet (not a wrapping
            parent) — the opaque sheet on top naturally blocks touches from reaching this, so no
            stopPropagation hack is needed, and the sheet itself has zero non-scrollable padding
            "gutters" that could swallow drags. */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View
          style={[styles.sheet, { maxHeight: sheetMaxHeight }]}
          testID="reminder-center-sheet"
        >
          <ScrollView
            style={[styles.scrollArea, { maxHeight: sheetMaxHeight }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={true}
          >
          <View style={styles.header}>
            <Text style={styles.title}>Reminder Center</Text>
            <TouchableOpacity testID="reminder-center-close" onPress={onClose} hitSlop={16}>
              <Ionicons name="close" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          {permBlocked && (
            <View style={styles.permBanner} testID="reminder-center-permission-banner">
              <Ionicons name="notifications-off-outline" size={18} color={COLORS.warning} />
              <Text style={styles.permBannerText}>
                Notifications are turned off for mTree in your device settings, so reminders won&apos;t fire.
              </Text>
              <TouchableOpacity
                testID="reminder-center-open-settings"
                onPress={() => Linking.openSettings()}
                style={styles.permBannerBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.permBannerBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Daily Reminders</Text>
              <Text style={styles.toggleSub}>{enabled ? "Enabled" : "Disabled"}</Text>
            </View>
            <Switch
              testID="reminder-center-toggle"
              value={enabled}
              onValueChange={onToggleEnabled}
              trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
              thumbColor={COLORS.white}
            />
          </View>

          <Text style={styles.subLabel}>FREQUENCY (up to 10x/day)</Text>
          <View style={[styles.chipWrap, { opacity: enabled ? 1 : 0.4 }]}>
            {REMINDER_OPTIONS.filter((n) => n > 0).map((n) => (
              <Chip
                key={n}
                testID={`reminder-center-freq-${n}`}
                label={`${n}x/day`}
                selected={count === n}
                onPress={() => enabled && selectCount(n)}
              />
            ))}
          </View>

          <Text style={styles.subLabel}>SCHEDULE</Text>
          <View style={[styles.modeRow, { opacity: enabled ? 1 : 0.4 }]}>
            <TouchableOpacity
              testID="reminder-center-mode-random"
              disabled={!enabled}
              onPress={() => selectMode("random")}
              style={[styles.modeBtn, mode === "random" && styles.modeBtnActive]}
              activeOpacity={0.85}
            >
              <Ionicons name="shuffle" size={15} color={mode === "random" ? COLORS.void : COLORS.gray1} />
              <Text style={[styles.modeBtnText, mode === "random" && styles.modeBtnTextActive]}>Random</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="reminder-center-mode-custom"
              disabled={!enabled}
              onPress={() => selectMode("custom")}
              style={[styles.modeBtn, mode === "custom" && styles.modeBtnActive]}
              activeOpacity={0.85}
            >
              <Ionicons name="time" size={15} color={mode === "custom" ? COLORS.void : COLORS.gray1} />
              <Text style={[styles.modeBtnText, mode === "custom" && styles.modeBtnTextActive]}>Custom Times</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modeHint}>
            {mode === "random"
              ? "Reminders fire at naturally spread random times, never during busy hours."
              : "Pick the exact time for each reminder below."}
          </Text>

          {mode === "custom" && enabled && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {Array.from({ length: count }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  testID={`reminder-center-time-${i}`}
                  onPress={() => setPickerFor(i)}
                  style={styles.timeRow}
                  activeOpacity={0.85}
                >
                  <Text style={styles.timeRowLabel}>Reminder {i + 1}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.timeRowValue}>{formatTime(times[i])}</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.subLabel}>BUSY HOURS (DO NOT DISTURB)</Text>
          <View style={[styles.toggleRow, { opacity: enabled ? 1 : 0.4, marginBottom: 12 }]}>
            <View>
              <Text style={styles.toggleLabel}>Avoid Busy Hours</Text>
              <Text style={styles.toggleSub}>
                {busyHoursEnabled ? "Reminders skip your busy window" : "Off — reminders fire anytime"}
              </Text>
            </View>
            <Switch
              testID="reminder-center-busy-toggle"
              value={busyHoursEnabled}
              disabled={!enabled}
              onValueChange={setBusyHoursEnabled}
              trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
              thumbColor={COLORS.white}
            />
          </View>
          <View style={[styles.busyRow, { opacity: enabled && busyHoursEnabled ? 1 : 0.4 }]}>
            <TouchableOpacity
              testID="reminder-center-busy-start"
              disabled={!enabled || !busyHoursEnabled}
              onPress={() => setPickerFor("start")}
              style={styles.busyPill}
              activeOpacity={0.85}
            >
              <Text style={styles.busyLabel}>FROM</Text>
              <Text style={styles.busyTime}>{formatTime(busyStart)}</Text>
            </TouchableOpacity>
            <Ionicons name="arrow-forward" size={16} color={COLORS.gray2} />
            <TouchableOpacity
              testID="reminder-center-busy-end"
              disabled={!enabled || !busyHoursEnabled}
              onPress={() => setPickerFor("end")}
              style={styles.busyPill}
              activeOpacity={0.85}
            >
              <Text style={styles.busyLabel}>TO</Text>
              <Text style={styles.busyTime}>{formatTime(busyEnd)}</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === "android" && pickerFor !== null && (
            <DateTimePicker
              value={timeToDate(pickerValue())}
              mode="time"
              display="clock"
              is24Hour={false}
              onChange={onPickerChange}
            />
          )}
          {Platform.OS === "ios" && (
            <Modal transparent visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
              <View style={styles.iosPickerWrap}>
                <View style={styles.iosPickerCard}>
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity onPress={() => setPickerFor(null)}>
                      <Text style={{ color: COLORS.gray1, fontSize: 15 }}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "700" }}>{pickerLabel}</Text>
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
          {Platform.OS === "web" && pickerFor !== null && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.subLabel}>QUICK PRESET — {pickerLabel}</Text>
              <View style={styles.chipWrap}>
                {["06:00", "07:00", "08:00", "09:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "23:00"].map((t) => (
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

          <FilledButton
            testID="reminder-center-save"
            label={saving ? "Saving..." : "Save Changes"}
            onPress={save}
            disabled={saving}
            style={{ marginTop: 24 }}
          />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    // maxHeight is set inline as a numeric pixel value (via useWindowDimensions) — percentage
    // strings ("88%") don't reliably bound a flex child whose ancestor chain has no definite
    // height on every platform. NOTE: no padding here on purpose — see scrollContent below.
  },
  // ALL padding lives here (inside the ScrollView's content), not on `sheet`. Previously
  // paddingTop/paddingBottom/paddingHorizontal were on the outer `sheet` box, which is OUTSIDE
  // the ScrollView's own hit area — those inset margins (and the space above/below the header)
  // visually looked like "empty" areas but a drag starting there never reached the ScrollView,
  // so scrolling only worked when a drag started directly over a chip/button/text row. Moving
  // all padding into contentContainerStyle makes the ENTIRE sheet, edge to edge, part of the
  // ScrollView's scrollable surface.
  scrollContent: { paddingTop: 18, paddingBottom: 28, paddingHorizontal: 18, flexGrow: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  // NOTE: deliberately NOT flex:1 here. flex:1 (flex-basis:0) on a ScrollView whose parent
  // (`sheet`) is an auto/content-hugging box (only capped via maxHeight, no explicit height)
  // collapses to ~0px on first layout because there's no "extra space" for flex-grow to fill —
  // this was the root cause of the sheet rendering as a blank/transparent card. A plain numeric
  // maxHeight (applied inline via useWindowDimensions, same proven pattern as LanguagePicker's
  // FlatList) reliably bounds the ScrollView without depending on ambiguous flex resolution.
  scrollArea: {},
  title: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  permBanner: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8,
    backgroundColor: COLORS.warning + "16", borderWidth: 1, borderColor: COLORS.warning + "40",
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  permBannerText: { color: COLORS.gray1, fontSize: 12.5, lineHeight: 17, flex: 1, minWidth: 140 },
  permBannerBtn: { backgroundColor: COLORS.warning, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  permBannerBtnText: { color: COLORS.void, fontSize: 12, fontWeight: "800" },
  toggleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: COLORS.surface2, borderRadius: 16, padding: 16,
  },
  toggleLabel: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  toggleSub: { color: COLORS.gray2, fontSize: 12, marginTop: 2 },
  subLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 22, marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44, borderRadius: 14, backgroundColor: COLORS.surface2,
  },
  modeBtnActive: { backgroundColor: COLORS.gold },
  modeBtnText: { color: COLORS.gray1, fontSize: 13.5, fontWeight: "700" },
  modeBtnTextActive: { color: COLORS.void },
  modeHint: { color: COLORS.gray2, fontSize: 12, marginTop: 8, lineHeight: 17 },
  timeRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: COLORS.surface2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
  },
  timeRowLabel: { color: COLORS.gray1, fontSize: 13.5, fontWeight: "600" },
  timeRowValue: { color: COLORS.white, fontSize: 14.5, fontWeight: "800" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  busyPill: { flex: 1, height: 62, borderRadius: 16, backgroundColor: COLORS.surface2, justifyContent: "center", paddingHorizontal: 16 },
  busyLabel: { color: COLORS.gray2, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  busyTime: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: 4 },
  iosPickerWrap: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  iosPickerCard: { backgroundColor: COLORS.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 },
});
