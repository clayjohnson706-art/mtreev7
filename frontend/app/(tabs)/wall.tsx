import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Dimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES, CYCLE_OPTIONS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card, FilledButton, GhostButton } from "@/src/components/ui";
import { DeityStone } from "@/src/components/DeityStone";
import SwipeNav from "@/src/components/SwipeNav";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";
import { useDoubleBackExit } from "@/src/hooks/use-double-back-exit";

const REFRESH_MS = 16 * 60 * 1000;
const RESULT_COUNTS = [10, 20, 50];
const { height: SCREEN_H } = Dimensions.get("window");

type WallFilters = {
  goal_category: string | null;
  sacrifice_category: string | null;
  cycle_days: number | null;
  fasting_enabled: boolean | null;
  limit: number;
};
const DEFAULT_FILTERS: WallFilters = {
  goal_category: null, sacrifice_category: null, cycle_days: null, fasting_enabled: null, limit: 20,
};

export default function Wall() {
  const router = useRouter();
  const { user } = useAuth();
  const { toastStyle: exitToastStyle } = useDoubleBackExit();
  const [items, setItems] = useState<any[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS);
  const [filters, setFilters] = useState<WallFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<WallFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const lastLoadRef = useRef<number>(Date.now());

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.goal_category) n++;
    if (filters.sacrifice_category) n++;
    if (filters.cycle_days) n++;
    if (filters.fasting_enabled !== null) n++;
    if (filters.limit !== DEFAULT_FILTERS.limit) n++;
    return n;
  }, [filters]);

  const load = useCallback(async () => {
    if (!user?.is_premium) { setItems([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.goal_category) params.set("goal_category", filters.goal_category);
      if (filters.sacrifice_category) params.set("sacrifice_category", filters.sacrifice_category);
      if (filters.cycle_days) params.set("cycle_days", String(filters.cycle_days));
      if (filters.fasting_enabled !== null) params.set("fasting_enabled", String(filters.fasting_enabled));
      params.set("limit", String(filters.limit));
      const data = await api<any[]>(`/community/wall?${params.toString()}`);
      setItems(data);
      lastLoadRef.current = Date.now();
      setCountdown(REFRESH_MS);
      const savedList = await api<any[]>("/community/saved").catch(() => []);
      setSaved(new Set(savedList.map((m: any) => m.id)));
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [user?.is_premium, filters]);

  // Plain mount + filter-change effect — deliberately NOT useFocusEffect. Wall tab screens stay
  // mounted (SwipeNav/bottom-tabs), so `useFocusEffect` was firing `load()` (which always resets
  // the countdown to REFRESH_MS) on every single tab switch back to Community, restarting the
  // refresh timer from scratch each time. Loading now only happens on first mount, when filters
  // actually change, when the 16-minute interval elapses, or when the user taps to refresh
  // manually — never just from navigating between tabs.
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.is_premium) return;
    const iv = setInterval(() => {
      const remaining = Math.max(0, REFRESH_MS - (Date.now() - lastLoadRef.current));
      setCountdown(remaining);
      if (remaining <= 0) load();
    }, 1000);
    return () => clearInterval(iv);
  }, [load, user?.is_premium]);

  const toggleSave = async (id: string) => {
    const wasSaved = saved.has(id);
    const next = new Set(saved);
    if (wasSaved) next.delete(id); else next.add(id);
    setSaved(next);
    try { await api(`/community/save/${id}`, { method: "POST" }); } catch {}
  };

  const refreshLabel = useMemo(() => {
    const mins = Math.floor(countdown / 60000);
    const secs = Math.floor((countdown % 60000) / 1000);
    return `Refreshes in ${mins}m ${secs.toString().padStart(2, "0")}s`;
  }, [countdown]);

  const openFilters = () => { setDraftFilters(filters); setShowFilters(true); };
  const applyFilters = () => { setFilters(draftFilters); setShowFilters(false); };
  const resetFilters = () => { setDraftFilters(DEFAULT_FILTERS); };

  if (!user?.is_premium) {
    return (
      <View style={styles.container} testID="wall-locked">
        <AnimatedBackground deityColor={COLORS.electric} />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <SwipeNav screen="wall">
            <View style={styles.center}>
              <Ionicons name="lock-closed" size={48} color={COLORS.gold} />
              <Text style={styles.lockTitle}>Community Wall is Premium</Text>
              <Text style={styles.lockDesc}>
                See what others have manifested. Draw inspiration. Save cards that resonate with you.
              </Text>
              <FilledButton
                testID="wall-upgrade"
                label="Upgrade ✦"
                onPress={() => router.push("/paywall")}
                style={{ marginTop: 24, width: 200 }}
              />
            </View>
          </SwipeNav>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="wall-screen">
      <AnimatedBackground deityColor={COLORS.electric} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <SwipeNav screen="wall">
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Community</Text>
              <Text style={styles.refresh}>{refreshLabel}</Text>
            </View>
            <TouchableOpacity testID="wall-filter-btn" onPress={openFilters} style={styles.filterBtn} activeOpacity={0.85}>
              <Ionicons name="options-outline" size={18} color={COLORS.white} />
              <Text style={styles.filterBtnText}>Filter</Text>
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge} testID="wall-filter-badge">
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {loading && <Text style={styles.hint}>Loading...</Text>}
          {!loading && items.length === 0 && (
            <Text style={styles.hint}>
              {activeFilterCount > 0 ? "No manifestations match these filters." : "No manifestations yet. Be the first to inspire!"}
            </Text>
          )}
          {items.map((m) => {
            const d = DEITIES.find((x) => x.id === m.deity_id) ?? DEITIES[0];
            const goal = GOAL_CATEGORIES.find((g) => g.key === m.goal_category);
            const isDone = m.status === "manifested";
            const isSaved = saved.has(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                testID={`wall-item-${m.id}`}
                onPress={() => setSelected(m)}
                activeOpacity={0.9}
                style={{ marginBottom: 12 }}
              >
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{m.user_name || "Anonymous"}</Text>
                      <View style={styles.deityRow}>
                        <View style={[styles.deityChip, { backgroundColor: d.color + "20" }]}>
                          <Text style={{ color: d.color, fontSize: 11, fontWeight: "700" }}>{d.name}</Text>
                        </View>
                        <TouchableOpacity
                          testID={`wall-save-${m.id}`}
                          onPress={(e) => { e.stopPropagation?.(); toggleSave(m.id); }}
                          hitSlop={12}
                          style={styles.saveBtn}
                        >
                          <Ionicons
                            name={isSaved ? "bookmark" : "bookmark-outline"}
                            size={18}
                            color={isSaved ? COLORS.gold : COLORS.gray1}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.goalRow}>
                    {m.goal_category === "custom" ? "✨ Personal Goal" : `${goal?.emoji ?? "📌"} ${goal?.label ?? m.goal_category}`} · {m.cycle_days} days
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                    <View style={[styles.dot, { backgroundColor: isDone ? COLORS.success : COLORS.warning }]} />
                    <Text style={styles.metaText}>{isDone ? "Manifested" : `Day ${m.current_day}/${m.cycle_days}`}</Text>
                    <Text style={[styles.metaText, { marginLeft: 12 }]}>🔥 {m.streak_count}</Text>
                    {m.donated && <Text style={[styles.metaText, { marginLeft: 12, color: COLORS.gold }]}>Donated</Text>}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </SwipeNav>
      </SafeAreaView>
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} testID="wall-detail-modal">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
          <View style={styles.detailSheet} testID="wall-detail-sheet">
            {selected && (
              <DetailPanel
                manifestation={selected}
                onClose={() => setSelected(null)}
                onToggleSave={toggleSave}
                isSaved={saved.has(selected.id)}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)} testID="wall-filter-modal">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowFilters(false)} />
          <View style={styles.filterSheet} testID="wall-filter-sheet">
            <View style={styles.detailHeader}>
              <View style={styles.detailHandle} />
              <TouchableOpacity testID="filter-close" onPress={() => setShowFilters(false)} style={styles.modalClose} hitSlop={16}>
                <Ionicons name="close" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterTitle}>Filter Wall</Text>

              <Text style={styles.filterLabel}>GOAL</Text>
              <View style={styles.chipRow}>
                <Chip label="Any" selected={!draftFilters.goal_category} onPress={() => setDraftFilters((f) => ({ ...f, goal_category: null }))} testID="filter-goal-any" />
                {GOAL_CATEGORIES.filter((g) => g.key !== "custom").map((g) => (
                  <Chip
                    key={g.key}
                    label={`${g.emoji} ${g.label}`}
                    selected={draftFilters.goal_category === g.key}
                    onPress={() => setDraftFilters((f) => ({ ...f, goal_category: g.key }))}
                    testID={`filter-goal-${g.key}`}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>SACRIFICE</Text>
              <View style={styles.chipRow}>
                <Chip label="Any" selected={!draftFilters.sacrifice_category} onPress={() => setDraftFilters((f) => ({ ...f, sacrifice_category: null }))} testID="filter-sacrifice-any" />
                {SACRIFICE_CATEGORIES.filter((s) => s.key !== "custom").map((s) => (
                  <Chip
                    key={s.key}
                    label={`${s.emoji} ${s.label}`}
                    selected={draftFilters.sacrifice_category === s.key}
                    onPress={() => setDraftFilters((f) => ({ ...f, sacrifice_category: s.key }))}
                    testID={`filter-sacrifice-${s.key}`}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>MANIFESTATION DURATION</Text>
              <View style={styles.chipRow}>
                <Chip label="Any" selected={!draftFilters.cycle_days} onPress={() => setDraftFilters((f) => ({ ...f, cycle_days: null }))} testID="filter-duration-any" />
                {CYCLE_OPTIONS.map((c) => (
                  <Chip
                    key={c.days}
                    label={c.label}
                    selected={draftFilters.cycle_days === c.days}
                    onPress={() => setDraftFilters((f) => ({ ...f, cycle_days: c.days }))}
                    testID={`filter-duration-${c.days}`}
                  />
                ))}
              </View>

              <Text style={styles.filterLabel}>FASTING</Text>
              <View style={styles.chipRow}>
                <Chip label="Any" selected={draftFilters.fasting_enabled === null} onPress={() => setDraftFilters((f) => ({ ...f, fasting_enabled: null }))} testID="filter-fasting-any" />
                <Chip label="Yes" selected={draftFilters.fasting_enabled === true} onPress={() => setDraftFilters((f) => ({ ...f, fasting_enabled: true }))} testID="filter-fasting-yes" />
                <Chip label="No" selected={draftFilters.fasting_enabled === false} onPress={() => setDraftFilters((f) => ({ ...f, fasting_enabled: false }))} testID="filter-fasting-no" />
              </View>

              <Text style={styles.filterLabel}>NUMBER OF RESULTS</Text>
              <View style={styles.chipRow}>
                {RESULT_COUNTS.map((n) => (
                  <Chip
                    key={n}
                    label={n === 20 ? `${n} (Default)` : n === 50 ? `${n} (Max)` : String(n)}
                    selected={draftFilters.limit === n}
                    onPress={() => setDraftFilters((f) => ({ ...f, limit: n }))}
                    testID={`filter-limit-${n}`}
                  />
                ))}
              </View>

              <FilledButton testID="filter-apply" label="Apply Filters" onPress={applyFilters} style={{ marginTop: 24, alignSelf: "stretch" }} />
              <GhostButton testID="filter-reset" label="Reset" onPress={resetFilters} style={{ marginTop: 10, alignSelf: "stretch" }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Double-back-to-exit — Wall is a top-level tab with nowhere to navigate back to. */}
      <Animated.View pointerEvents="none" testID="wall-exit-toast" style={[styles.exitToast, exitToastStyle]}>
        <Text style={styles.exitToastText}>Press back again to exit</Text>
      </Animated.View>
    </View>
  );
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailPanel({ manifestation, onClose, onToggleSave, isSaved }: any) {
  const m = manifestation;
  const d = DEITIES.find((x) => x.id === m.deity_id) ?? DEITIES[0];
  const goal = GOAL_CATEGORIES.find((g) => g.key === m.goal_category);
  const sac = SACRIFICE_CATEGORIES.find((s) => s.key === m.sacrifice_category);
  const goalText = m.goal_category === "custom" ? "✨ Personal Goal" : `${goal?.emoji ?? "📌"} ${goal?.label ?? m.goal_category}`;
  const sacText = m.sacrifice_category === "custom" ? "🔒 Personal Sacrifice" : `${sac?.emoji ?? "📌"} ${sac?.label ?? m.sacrifice_category}`;
  const created = m.created_at ? new Date(m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "-";
  const completed = m.manifested_at ? new Date(m.manifested_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[d.color + "22", COLORS.surface1]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      <View style={styles.detailHeader}>
        <View style={styles.detailHandle} />
        <TouchableOpacity testID="detail-close" onPress={onClose} style={styles.modalClose} hitSlop={16}>
          <Ionicons name="close" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center" }}>
          <DeityStone deityName={d.name} color={d.color} glow={d.glow} size={92} glowIntensity={1.4} />
          <Text style={[styles.detailDeity, { color: d.color }]}>{d.name.toUpperCase().split("").join(" ")}</Text>
          <Text style={styles.detailUser}>{m.user_name || "Anonymous"}</Text>
        </View>

        <View style={styles.detailBlock}>
          <DetailRow label="GOAL" value={goalText} />
          <Divider />
          <DetailRow label="SACRIFICE" value={sacText} />
          <Divider />
          <DetailRow label="DURATION" value={`${m.cycle_days} days`} />
          <Divider />
          <DetailRow label="AFFIRMATION" value={m.affirmation_enabled ? "On" : "Off"} />
          <Divider />
          <DetailRow label="FASTING" value={m.fasting_enabled ? "Yes ✓" : "No"} />
        </View>

        <View style={styles.detailBlock}>
          <DetailRow label="STATUS" value={m.status === "manifested" ? "✅ Manifested" : m.status === "active" ? "🌱 Active" : m.status} />
          <Divider />
          <DetailRow label="STREAK" value={`${m.streak_count} days 🔥`} />
          <Divider />
          <DetailRow label="MAX STREAK" value={`${m.max_streak} days`} />
          <Divider />
          <DetailRow label="COSMIC AT START" value={m.cosmic_level_at_start != null ? `${m.cosmic_level_at_start}%` : "-"} />
          <Divider />
          <DetailRow label="DONATED" value={m.donated ? "Yes ✓" : "No"} />
        </View>

        <View style={styles.detailBlock}>
          <DetailRow label="CREATED" value={created} />
          {m.moon_phase_at_start ? (<><Divider /><DetailRow label="MOON AT START" value={`🌙 ${m.moon_phase_at_start}`} /></>) : null}
          {completed && (<><Divider /><DetailRow label="COMPLETED" value={completed} /></>)}
        </View>

        <TouchableOpacity
          testID={`detail-save-${m.id}`}
          onPress={() => onToggleSave(m.id)}
          style={[styles.saveCta, { backgroundColor: isSaved ? COLORS.gold : COLORS.surface2 }]}
          activeOpacity={0.85}
        >
          <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? COLORS.void : COLORS.gold} />
          <Text style={[styles.saveCtaText, { color: isSaved ? COLORS.void : COLORS.gold }]}>
            {isSaved ? "Saved" : "Save Manifestation"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  lockTitle: { color: COLORS.white, fontSize: 22, fontWeight: "800", marginTop: 20, textAlign: "center" },
  lockDesc: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 22 },
  title: { color: COLORS.white, fontSize: 28, fontWeight: "900", marginTop: 8 },
  refresh: { color: COLORS.gray2, fontSize: 11, marginTop: 4, marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.surface2, borderRadius: 999,
    paddingHorizontal: 14, height: 40, marginTop: 8,
  },
  filterBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 999, backgroundColor: COLORS.gold,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  filterBadgeText: { color: COLORS.void, fontSize: 10, fontWeight: "800" },
  hint: { color: COLORS.gray2, textAlign: "center", marginTop: 40 },
  userName: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  deityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  deityChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  saveBtn: { width: 32, height: 32, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center" },
  goalRow: { color: COLORS.gray1, fontSize: 13, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { color: COLORS.gray2, fontSize: 12, marginLeft: 6 },

  // Modal
  modalOverlay: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000E0" },
  detailSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  detailHeader: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  detailHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.gray3, marginBottom: 8 },
  modalClose: { position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center", zIndex: 5 },
  detailDeity: { fontSize: 16, fontWeight: "300", letterSpacing: 5, fontStyle: "italic", marginTop: 14 },
  detailUser: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 8 },
  detailBlock: { marginTop: 18, backgroundColor: COLORS.surface2, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rowLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  rowValue: { color: COLORS.white, fontSize: 14, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  divider: { height: 1, backgroundColor: COLORS.gray3 + "60" },
  testimonyBox: { marginTop: 18, marginBottom: 8, padding: 18, borderRadius: 18, backgroundColor: COLORS.gold + "10" },
  testimonyText: { color: COLORS.white, fontSize: 15, fontStyle: "italic", marginTop: 8, lineHeight: 24 },
  saveCta: { marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16 },
  saveCtaText: { fontSize: 14, fontWeight: "700" },

  // Filter panel
  filterSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.82,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  filterTitle: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginBottom: 16 },
  filterLabel: { color: COLORS.gray2, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginTop: 18, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.gray3, flexShrink: 0,
  },
  chipSelected: { backgroundColor: COLORS.gold + "20", borderColor: COLORS.gold },
  chipText: { color: COLORS.gray1, fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: COLORS.gold, fontWeight: "800" },

  exitToast: { position: "absolute", bottom: 110, left: 24, right: 24, alignItems: "center" },
  exitToastText: {
    backgroundColor: "#000000CC", color: COLORS.white, fontSize: 13, fontWeight: "600",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, overflow: "hidden",
  },
});
