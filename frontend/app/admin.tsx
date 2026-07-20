import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, DEITIES, LANGUAGES, COUNTRIES, flagEmoji } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/utils/api";

type AdminUser = {
  user_id: string;
  email: string;
  name: string;
  is_premium: boolean;
  is_public: boolean;
  is_blocked?: boolean;
  blocked_until?: string | null;
  country?: string | null;
  created_at: string;
};

type AdminUserDetail = AdminUser & {
  gender?: string | null;
  dob?: string | null;
  deity_id?: number | null;
  premium_expires_at?: string | null;
  affirmation_language?: string;
  notification_count?: number;
};

type AdminManifestation = {
  id: string;
  goal_category: string;
  sacrifice_category: string;
  cycle_days: number;
  current_day: number;
  streak_count: number;
  status: string;
  is_public: boolean;
  started_at: string;
  manifested_at?: string | null;
};

type Stats = {
  total_users: number;
  premium_users: number;
  total_manifestations: number;
  active_manifestations: number;
  completed_manifestations: number;
  wall_posts: number;
};

type WallItem = {
  id: string;
  user_name?: string;
  goal_category: string;
  streak_count: number;
  created_at: string;
};

const BLOCK_DURATIONS: { label: string; days: number | null }[] = [
  { label: "1 Day", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "Permanent", days: null },
];

const PREMIUM_EXTEND_OPTIONS: { label: string; days: number }[] = [
  { label: "+7 Days", days: 7 },
  { label: "+30 Days", days: 30 },
  { label: "+90 Days", days: 90 },
  { label: "+1 Year", days: 365 },
];

type DeleteTarget = { type: "user" | "manifestation"; id: string; label: string };

export default function AdminPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<"users" | "wall">("users");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [wallItems, setWallItems] = useState<WallItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [userManifestations, setUserManifestations] = useState<AdminManifestation[]>([]);
  const [totalDonatedUsd, setTotalDonatedUsd] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [logoutNotice, setLogoutNotice] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadStats = useCallback(async () => {
    setStats(await api<Stats>("/admin/stats"));
  }, []);

  const loadUsers = useCallback(async (q: string = "") => {
    const qs = q ? `?search=${encodeURIComponent(q)}&limit=100` : "?limit=100";
    const res = await api<{ total: number; users: AdminUser[] }>(`/admin/users${qs}`);
    setUsers(res.users);
  }, []);

  const loadWall = useCallback(async () => {
    const res = await api<{ total: number; items: WallItem[] }>(
      "/admin/manifestations?status_filter=manifested&limit=100"
    );
    setWallItems(res.items);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadStats(), loadUsers(search), loadWall()]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [loadStats, loadUsers, loadWall, search]);

  useEffect(() => {
    (async () => { setLoading(true); await loadAll(); setLoading(false); })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const runSearch = (text: string) => {
    setSearch(text);
    loadUsers(text).catch(() => setLoadError(true));
  };

  const openUserDetail = async (u: AdminUser) => {
    setSelectedUserId(u.user_id);
    setUserDetail(null);
    setUserManifestations([]);
    setTotalDonatedUsd(0);
    setEditingName(false);
    setLogoutNotice(null);
    setDetailLoading(true);
    try {
      const res = await api<{ user: AdminUserDetail; manifestations: AdminManifestation[]; total_donated_usd: number }>(`/admin/users/${u.user_id}`);
      setUserDetail(res.user);
      setUserManifestations(res.manifestations);
      setTotalDonatedUsd(res.total_donated_usd);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeUserDetail = () => {
    setSelectedUserId(null);
    setUserDetail(null);
    setUserManifestations([]);
    setTotalDonatedUsd(0);
    setEditingName(false);
    setLogoutNotice(null);
  };

  // Applies an updated user object everywhere it's cached — the detail view and the list row.
  const applyUserUpdate = (updated: AdminUserDetail) => {
    setUserDetail(updated);
    setUsers((prev) => prev.map((x) => (x.user_id === updated.user_id ? { ...x, ...updated } : x)));
  };

  const startEditName = () => {
    setNameInput(userDetail?.name || "");
    setEditingName(true);
  };

  const saveName = async () => {
    if (!userDetail) return;
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}`, {
        method: "PATCH",
        body: { name: trimmed },
      });
      applyUserUpdate(updated);
      setEditingName(false);
    } finally {
      setSavingUser(false);
    }
  };

  const togglePremium = async () => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}`, {
        method: "PATCH",
        body: { is_premium: !userDetail.is_premium },
      });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const extendPremium = async (days: number) => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}/extend-premium`, {
        method: "POST",
        body: { days },
      });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const revokePremium = async () => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}/revoke-premium`, { method: "POST" });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const togglePublic = async () => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}`, {
        method: "PATCH",
        body: { is_public: !userDetail.is_public },
      });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const blockUser = async (days: number | null) => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}/block`, {
        method: "POST",
        body: { days },
      });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const unblockUser = async () => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const updated = await api<AdminUserDetail>(`/admin/users/${userDetail.user_id}/unblock`, { method: "POST" });
      applyUserUpdate(updated);
    } finally {
      setSavingUser(false);
    }
  };

  const forceLogout = async () => {
    if (!userDetail) return;
    setSavingUser(true);
    try {
      const res = await api<{ ok: boolean; sessions_revoked: number }>(`/admin/users/${userDetail.user_id}/force-logout`, { method: "POST" });
      setLogoutNotice(
        res.sessions_revoked > 0
          ? `Signed out of ${res.sessions_revoked} active session${res.sessions_revoked === 1 ? "" : "s"}.`
          : "No active sessions to sign out."
      );
    } finally {
      setSavingUser(false);
    }
  };

  const deleteManifestation = async (mid: string, label: string) => {
    setDeleteTarget({ type: "manifestation", id: mid, label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "user") {
        await api(`/admin/users/${deleteTarget.id}`, { method: "DELETE" });
        setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.id));
        closeUserDetail();
      } else {
        await api(`/admin/manifestations/${deleteTarget.id}`, { method: "DELETE" });
        setWallItems((prev) => prev.filter((w) => w.id !== deleteTarget.id));
        setUserManifestations((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
      loadStats();
    } finally {
      setDeleting(false);
    }
  };

  const deity = DEITIES.find((d) => d.id === userDetail?.deity_id);
  const languageLabel = LANGUAGES.find((l) => l.code === userDetail?.affirmation_language)?.label;
  const countryName = COUNTRIES.find((c) => c.code === userDetail?.country)?.name;

  return (
    <View style={styles.container} testID="admin-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="admin-back">
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin Panel</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        >
          <Text style={styles.signedInAs}>Signed in as {user?.email}</Text>

          {loading && !stats ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginTop: 40 }} testID="admin-loading" />
          ) : loadError && !stats ? (
            <View style={styles.errorBox} testID="admin-load-error">
              <Ionicons name="cloud-offline" size={24} color={COLORS.danger} />
              <Text style={styles.errorText}>Couldn&apos;t load admin data. Check your connection.</Text>
              <TouchableOpacity
                testID="admin-retry-btn"
                onPress={async () => { setLoading(true); await loadAll(); setLoading(false); }}
                style={styles.retryBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {loadError && (
                <View style={styles.inlineErrorBanner} testID="admin-inline-error-banner">
                  <Ionicons name="warning" size={14} color={COLORS.danger} />
                  <Text style={styles.inlineErrorText}>Some data failed to refresh.</Text>
                  <TouchableOpacity testID="admin-inline-retry-btn" onPress={() => loadAll()}>
                    <Text style={styles.inlineRetryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.statsGrid}>
                <StatCard testID="admin-stat-total-users" label="Total Users" value={stats?.total_users ?? 0} icon="people" />
                <StatCard testID="admin-stat-premium-users" label="Premium" value={stats?.premium_users ?? 0} icon="star" color={COLORS.gold} />
                <StatCard testID="admin-stat-active" label="Active" value={stats?.active_manifestations ?? 0} icon="flame" />
                <StatCard testID="admin-stat-completed" label="Completed" value={stats?.completed_manifestations ?? 0} icon="checkmark-circle" color={COLORS.success} />
                <StatCard testID="admin-stat-wall" label="Wall Posts" value={stats?.wall_posts ?? 0} icon="albums" />
                <StatCard testID="admin-stat-total-manifestations" label="Manifestations" value={stats?.total_manifestations ?? 0} icon="leaf" />
              </View>

              <View style={styles.segment}>
                <TouchableOpacity
                  testID="admin-tab-users"
                  style={[styles.segItem, tab === "users" && styles.segActive]}
                  onPress={() => setTab("users")}
                >
                  <Text style={[styles.segText, tab === "users" && styles.segTextActive]}>Users</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="admin-tab-wall"
                  style={[styles.segItem, tab === "wall" && styles.segActive]}
                  onPress={() => setTab("wall")}
                >
                  <Text style={[styles.segText, tab === "wall" && styles.segTextActive]}>Wall Posts</Text>
                </TouchableOpacity>
              </View>

              {tab === "users" ? (
                <>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color={COLORS.gray2} />
                    <TextInput
                      testID="admin-user-search"
                      value={search}
                      onChangeText={runSearch}
                      placeholder="Search by name or email"
                      placeholderTextColor={COLORS.gray2}
                      style={styles.searchInput}
                    />
                  </View>
                  {users.length === 0 ? (
                    <Text style={styles.emptyText}>No users found.</Text>
                  ) : (
                    users.map((u) => (
                      <Card
                        key={u.user_id}
                        onPress={() => openUserDetail(u)}
                        testID={`admin-user-row-${u.user_id}`}
                        wrapperStyle={{ marginBottom: 10 }}
                      >
                        <View style={styles.itemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={1}>{u.name}</Text>
                            <Text style={styles.itemSub} numberOfLines={1}>
                              {u.email}{u.country ? `  ·  ${flagEmoji(u.country)} ${u.country}` : ""}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.pill,
                              { backgroundColor: (u.is_blocked ? COLORS.danger : u.is_premium ? COLORS.success : COLORS.gray3) + "20" },
                            ]}
                          >
                            <Text
                              style={{
                                color: u.is_blocked ? COLORS.danger : u.is_premium ? COLORS.success : COLORS.gray1,
                                fontSize: 11,
                                fontWeight: "800",
                              }}
                            >
                              {u.is_blocked ? "BLOCKED" : u.is_premium ? "PREMIUM" : "FREE"}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ))
                  )}
                </>
              ) : (
                <>
                  {wallItems.length === 0 ? (
                    <Text style={styles.emptyText}>No wall posts yet.</Text>
                  ) : (
                    wallItems.map((w) => (
                      <Card key={w.id} testID={`admin-wall-row-${w.id}`} wrapperStyle={{ marginBottom: 10 }}>
                        <View style={styles.itemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={1}>{w.user_name || "Anonymous"}</Text>
                            <Text style={styles.itemSub} numberOfLines={1}>
                              {w.goal_category} · streak {w.streak_count}
                            </Text>
                          </View>
                          <TouchableOpacity
                            testID={`admin-wall-delete-${w.id}`}
                            onPress={() => deleteManifestation(w.id, `${w.user_name || "this"}'s wall post`)}
                            style={styles.deleteIconBtn}
                          >
                            <Ionicons name="trash" size={16} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                      </Card>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* User detail — full-screen panel with all controls */}
      <Modal
        visible={!!selectedUserId}
        animationType="slide"
        onRequestClose={closeUserDetail}
        testID="admin-user-detail-modal"
      >
        <View style={[styles.container, { backgroundColor: COLORS.void }]}>
          <AnimatedBackground deityColor={deity?.color || COLORS.gold} />
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
            <View style={styles.header}>
              <TouchableOpacity onPress={closeUserDetail} testID="admin-user-detail-close">
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.title}>User Details</Text>
              <View style={{ width: 24 }} />
            </View>

            {detailLoading || !userDetail ? (
              <ActivityIndicator color={COLORS.gold} style={{ marginTop: 60 }} testID="admin-detail-loading" />
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
                {/* Identity */}
                <Card>
                  {editingName ? (
                    <View style={styles.editNameRow}>
                      <TextInput
                        testID="admin-edit-name-input"
                        value={nameInput}
                        onChangeText={setNameInput}
                        style={styles.editNameInput}
                        placeholder="Name"
                        placeholderTextColor={COLORS.gray2}
                        autoFocus
                      />
                      <TouchableOpacity testID="admin-edit-name-save" onPress={saveName} disabled={savingUser} style={styles.editNameIconBtn}>
                        <Ionicons name="checkmark" size={20} color={COLORS.success} />
                      </TouchableOpacity>
                      <TouchableOpacity testID="admin-edit-name-cancel" onPress={() => setEditingName(false)} style={styles.editNameIconBtn}>
                        <Ionicons name="close" size={20} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.editNameRow} onPress={startEditName} testID="admin-edit-name-start" activeOpacity={0.7}>
                      <Text style={styles.detailNameLeft} numberOfLines={1}>{userDetail.name}</Text>
                      <Ionicons name="pencil" size={15} color={COLORS.gray2} />
                    </TouchableOpacity>
                  )}
                  <Text style={styles.detailEmailLeft}>{userDetail.email}</Text>
                  <Text style={styles.detailMetaLeft}>
                    Joined {new Date(userDetail.created_at).toLocaleDateString()}
                    {userDetail.gender ? ` · ${userDetail.gender}` : ""}
                    {userDetail.dob ? ` · DOB ${userDetail.dob}` : ""}
                  </Text>
                  {(deity || languageLabel) && (
                    <Text style={styles.detailMetaLeft}>
                      {deity ? `Deity: ${deity.name}` : ""}
                      {deity && languageLabel ? " · " : ""}
                      {languageLabel ? `Language: ${languageLabel}` : ""}
                    </Text>
                  )}
                  <Text style={styles.detailMetaLeft}>
                    Country: {userDetail.country ? `${flagEmoji(userDetail.country)} ${countryName || userDetail.country}` : "Not set"}
                  </Text>
                </Card>

                {/* Profile controls */}
                <Text style={styles.sectionLabel}>PROFILE</Text>
                <Card>
                  <View style={styles.detailRow}>
                    <Text style={styles.rowLabel}>Public Profile</Text>
                    <Switch
                      testID="admin-toggle-public"
                      value={userDetail.is_public}
                      onValueChange={togglePublic}
                      disabled={savingUser}
                      trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
                      thumbColor={COLORS.white}
                    />
                  </View>
                </Card>

                {/* Subscription controls */}
                <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
                <Card>
                  <View style={styles.detailRow}>
                    <Text style={styles.rowLabel}>Premium</Text>
                    <Switch
                      testID="admin-toggle-premium"
                      value={userDetail.is_premium}
                      onValueChange={togglePremium}
                      disabled={savingUser}
                      trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
                      thumbColor={COLORS.white}
                    />
                  </View>
                  {userDetail.premium_expires_at && (
                    <Text style={styles.rowValueMuted}>
                      Expires {new Date(userDetail.premium_expires_at).toLocaleDateString()}
                    </Text>
                  )}
                  <View style={styles.chipsRow}>
                    {PREMIUM_EXTEND_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.label}
                        testID={`admin-extend-premium-${opt.days}`}
                        onPress={() => extendPremium(opt.days)}
                        disabled={savingUser}
                        style={styles.goldChip}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.goldChipText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {userDetail.is_premium && (
                    <TouchableOpacity
                      testID="admin-revoke-premium-btn"
                      onPress={revokePremium}
                      disabled={savingUser}
                      style={styles.secondaryDangerBtn}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryDangerBtnText}>Revoke Premium Immediately</Text>
                    </TouchableOpacity>
                  )}
                </Card>

                {/* Donations */}
                <Text style={styles.sectionLabel}>DONATIONS</Text>
                <Card>
                  <View style={styles.detailRow}>
                    <Text style={styles.rowLabel}>Total Donated</Text>
                    <Text style={styles.totalDonatedText} testID="admin-total-donated-usd">
                      ${totalDonatedUsd.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.rowValueMuted}>Converted to USD across all their manifestations.</Text>
                </Card>

                {/* Manifestations */}
                <Text style={styles.sectionLabel}>MANIFESTATIONS ({userManifestations.length})</Text>
                {userManifestations.length === 0 ? (
                  <Card><Text style={styles.rowValueMuted}>No manifestations yet.</Text></Card>
                ) : (
                  userManifestations.map((m) => (
                    <Card key={m.id} testID={`admin-manifestation-row-${m.id}`} wrapperStyle={{ marginBottom: 8 }}>
                      <View style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {m.goal_category} · {m.sacrifice_category}
                          </Text>
                          <Text style={styles.itemSub} numberOfLines={1}>
                            {m.status} · day {m.current_day}/{m.cycle_days} · streak {m.streak_count}
                            {m.is_public ? " · public" : ""}
                          </Text>
                        </View>
                        <TouchableOpacity
                          testID={`admin-delete-manifestation-${m.id}`}
                          onPress={() => deleteManifestation(m.id, `this ${m.goal_category} manifestation`)}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash" size={16} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ))
                )}

                {/* Session control */}
                <Text style={styles.sectionLabel}>SESSION</Text>
                <Card>
                  <TouchableOpacity
                    testID="admin-force-logout-btn"
                    onPress={forceLogout}
                    disabled={savingUser}
                    style={styles.secondaryBtn}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="log-out" size={16} color={COLORS.white} />
                    <Text style={styles.secondaryBtnText}>Force Logout (All Devices)</Text>
                  </TouchableOpacity>
                  {!!logoutNotice && <Text style={styles.logoutNotice} testID="admin-logout-notice">{logoutNotice}</Text>}
                </Card>

                {/* Block access */}
                <Text style={styles.sectionLabel}>BLOCK ACCESS</Text>
                <Card>
                  {userDetail.is_blocked ? (
                    <>
                      <Text style={styles.blockedStatusText} testID="admin-blocked-status">
                        Blocked {userDetail.blocked_until
                          ? `until ${new Date(userDetail.blocked_until).toLocaleDateString()}`
                          : "permanently"}
                      </Text>
                      <TouchableOpacity
                        testID="admin-unblock-btn"
                        onPress={unblockUser}
                        disabled={savingUser}
                        style={styles.unblockBtn}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="lock-open" size={16} color={COLORS.white} />
                        <Text style={styles.unblockBtnText}>Unblock User</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={styles.chipsRow}>
                      {BLOCK_DURATIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.label}
                          testID={`admin-block-${opt.days ?? "permanent"}`}
                          onPress={() => blockUser(opt.days)}
                          disabled={savingUser}
                          style={styles.blockChip}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.blockChipText}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </Card>

                {/* Danger zone */}
                <Text style={[styles.sectionLabel, { color: COLORS.danger }]}>DANGER ZONE</Text>
                <Card>
                  <TouchableOpacity
                    testID="admin-delete-user-btn"
                    onPress={() => setDeleteTarget({ type: "user", id: userDetail.user_id, label: userDetail.name })}
                    style={styles.deleteBtn}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash" size={16} color={COLORS.white} />
                    <Text style={styles.deleteBtnText}>Delete User</Text>
                  </TouchableOpacity>
                </Card>
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Delete confirm modal */}
      <Modal transparent visible={!!deleteTarget} animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.detailCard} onPress={(e) => e.stopPropagation()} testID="admin-delete-confirm-card">
            <View style={styles.warnIcon}>
              <Ionicons name="warning" size={28} color={COLORS.danger} />
            </View>
            <Text style={styles.detailName}>Delete {deleteTarget?.label}?</Text>
            <Text style={styles.detailMeta}>This permanently removes all associated data. This cannot be undone.</Text>
            <TouchableOpacity
              testID="admin-delete-confirm-yes"
              onPress={confirmDelete}
              disabled={deleting}
              style={[styles.deleteBtn, { marginTop: 20 }]}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteBtnText}>{deleting ? "Deleting..." : "Yes, delete"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteTarget(null)} style={styles.closeBtn} testID="admin-delete-confirm-cancel">
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = COLORS.white,
  testID,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  testID?: string;
}) {
  return (
    <View style={styles.statCard} testID={testID}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  signedInAs: { color: COLORS.gray2, fontSize: 12, marginBottom: 16 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  statCard: {
    width: "31%",
    backgroundColor: COLORS.surface1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  statValue: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 6 },
  statLabel: { color: COLORS.gray2, fontSize: 10.5, marginTop: 2, textAlign: "center" },

  segment: { height: 44, borderRadius: 12, backgroundColor: COLORS.surface2, flexDirection: "row", padding: 3, marginTop: 12, marginBottom: 14 },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  segActive: { backgroundColor: COLORS.gold },
  segText: { color: COLORS.gray1, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: COLORS.void, fontWeight: "800" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.surface2, borderRadius: 12, paddingHorizontal: 14, height: 44, marginBottom: 12,
  },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14 },
  emptyText: { color: COLORS.gray2, fontSize: 13, textAlign: "center", marginTop: 30 },

  errorBox: { alignItems: "center", marginTop: 60, paddingHorizontal: 24 },
  errorText: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 20 },
  retryBtn: { marginTop: 16, backgroundColor: COLORS.gold, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: COLORS.void, fontSize: 13, fontWeight: "800" },
  inlineErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.danger + "18", borderRadius: 12, padding: 10, marginBottom: 12,
  },
  inlineErrorText: { color: COLORS.gray1, fontSize: 12, flex: 1 },
  inlineRetryText: { color: COLORS.gold, fontSize: 12, fontWeight: "800" },

  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  itemSub: { color: COLORS.gray2, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 8 },
  deleteIconBtn: { padding: 8, marginLeft: 8 },

  backdrop: { flex: 1, backgroundColor: "#000000E8", alignItems: "center", justifyContent: "center", padding: 24 },
  detailCard: {
    width: "100%", borderRadius: 24, backgroundColor: COLORS.surface1,
    padding: 24, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 18,
  },
  detailName: { color: COLORS.white, fontSize: 18, fontWeight: "800", textAlign: "center" },
  detailEmail: { color: COLORS.gray1, fontSize: 13, marginTop: 4, textAlign: "center" },
  detailMeta: { color: COLORS.gray2, fontSize: 12, marginTop: 6, textAlign: "center", lineHeight: 18 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignSelf: "stretch", marginTop: 16 },
  rowLabel: { color: COLORS.gray1, fontSize: 14 },
  rowValueMuted: { color: COLORS.gray2, fontSize: 14, fontWeight: "500" },
  totalDonatedText: { color: COLORS.success, fontSize: 18, fontWeight: "800" },

  blockedStatusText: { color: COLORS.danger, fontSize: 13, fontWeight: "600" },
  unblockBtn: {
    marginTop: 12, height: 44, borderRadius: 12, alignSelf: "stretch",
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.success,
  },
  unblockBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "800" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, alignSelf: "stretch" },
  blockChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: COLORS.danger + "18", borderWidth: 1, borderColor: COLORS.danger + "40",
  },
  blockChipText: { color: COLORS.danger, fontSize: 12.5, fontWeight: "700" },
  goldChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: COLORS.gold + "18", borderWidth: 1, borderColor: COLORS.gold + "50",
  },
  goldChipText: { color: COLORS.gold, fontSize: 12.5, fontWeight: "700" },

  sectionLabel: { color: COLORS.gray2, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  detailNameLeft: { color: COLORS.white, fontSize: 17, fontWeight: "800", flex: 1 },
  detailEmailLeft: { color: COLORS.gray1, fontSize: 13, marginTop: 4 },
  detailMetaLeft: { color: COLORS.gray2, fontSize: 12, marginTop: 4 },
  editNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  editNameInput: {
    flex: 1, color: COLORS.white, fontSize: 17, fontWeight: "800",
    borderBottomWidth: 1, borderBottomColor: COLORS.gold, paddingVertical: 2,
  },
  editNameIconBtn: { padding: 4 },

  secondaryBtn: {
    height: 46, borderRadius: 12, alignSelf: "stretch",
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface2,
  },
  secondaryBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  secondaryDangerBtn: { marginTop: 12, alignSelf: "stretch", alignItems: "center", paddingVertical: 8 },
  secondaryDangerBtnText: { color: COLORS.danger, fontSize: 12.5, fontWeight: "700" },
  logoutNotice: { color: COLORS.success, fontSize: 12, marginTop: 10, textAlign: "center" },

  warnIcon: { width: 56, height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.danger + "22" },
  deleteBtn: {
    height: 50, borderRadius: 14, alignSelf: "stretch",
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.danger,
  },
  deleteBtnText: { color: COLORS.white, fontSize: 14, fontWeight: "800" },
  closeBtn: { marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 },
  closeBtnText: { color: COLORS.gray1, fontSize: 14, fontWeight: "600" },
});
