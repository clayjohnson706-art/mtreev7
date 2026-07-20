import { Platform } from "react-native";

// Local (on-device) daily ritual reminders — scheduled via the OS notification scheduler so
// they keep firing even if the app is fully closed/killed. Rescheduled every time the app is
// opened (see AuthContext) as a safety net for the rare case an OS wipes scheduled alarms
// (e.g. after certain device reboots) — this is a managed-Expo-workflow limitation.
const ID_PREFIX = "mtree-reminder-";

const RITUAL_BODY =
  "Take a moment to breathe, focus on your intention, and complete today's ritual.";

// expo-notifications throws at import time in Expo Go on Android (SDK 53+ dropped remote-push
// support there) — even though we only use LOCAL notifications. Loading it lazily via
// require() inside a try/catch means that throw is caught here instead of crashing the whole
// app; every export below becomes a safe no-op when the module isn't available (Expo Go on
// Android), while working fully in a real dev/production build or on iOS/web.
let Notifications: typeof import("expo-notifications") | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    Notifications = null;
  }
}

export function notificationsAvailable(): boolean {
  return !!Notifications;
}

export type NotificationPermissionState = "granted" | "undetermined" | "denied" | "blocked" | "unavailable";

// Reads the CURRENT permission state without prompting the OS dialog — used to decide whether
// a contextual pre-permission explanation / "Open Settings" fallback should be shown, per the
// app's permission-handling rules (never prompt out of context, respect canAskAgain).
export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (!Notifications) return "unavailable";
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === "granted") return "granted";
    if (perm.status === "denied") return perm.canAskAgain === false ? "blocked" : "denied";
    return "undetermined";
  } catch {
    return "unavailable";
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "mTree Reminders",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#F5C542",
      });
    }
    return final === "granted";
  } catch {
    return false;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isBusyFactory(busyStart: string | null | undefined, busyEnd: string | null | undefined) {
  const startMin = busyStart ? toMinutes(busyStart) : null;
  const endMin = busyEnd ? toMinutes(busyEnd) : null;
  return (min: number) => {
    if (startMin == null || endMin == null || startMin === endMin) return false;
    if (startMin < endMin) return min >= startMin && min < endMin;
    return min >= startMin || min < endMin; // overnight wrap
  };
}

// Spreads `count` reminder times evenly across the day, skipping the user's Do-Not-Disturb
// (busy hours) window — handles an overnight window (e.g. 22:00 -> 07:00) correctly. Used as
// the sane starting point when a user first switches into "Custom" scheduling mode.
export function computeEvenReminderTimes(
  count: number,
  busyStart: string | null | undefined,
  busyEnd: string | null | undefined
): { hour: number; minute: number }[] {
  if (count <= 0) return [];
  const isBusy = isBusyFactory(busyStart, busyEnd);
  const endMin = busyEnd ? toMinutes(busyEnd) : null;
  const startMin = busyStart ? toMinutes(busyStart) : null;

  const busyLen =
    startMin != null && endMin != null
      ? startMin < endMin
        ? endMin - startMin
        : 1440 - (startMin - endMin)
      : 0;
  const availableMinutes = Math.max(count, 1440 - busyLen);
  const slot = Math.max(1, Math.floor(availableMinutes / count));
  const startCursor = endMin != null ? endMin : 0;

  const times: { hour: number; minute: number }[] = [];
  let cursor = startCursor;
  let guard = 0;
  while (times.length < count && guard < 1440 * 2) {
    const min = ((cursor % 1440) + 1440) % 1440;
    if (!isBusy(min)) {
      times.push({ hour: Math.floor(min / 60), minute: min % 60 });
      cursor += slot;
    } else {
      cursor += 1;
    }
    guard++;
  }
  return times;
}

// True "Random" mode — picks `count` naturally-spread random minutes across the day, entirely
// avoiding the busy/Do-Not-Disturb window, with a minimum gap between picks so reminders never
// cluster close together.
export function computeRandomReminderTimes(
  count: number,
  busyStart: string | null | undefined,
  busyEnd: string | null | undefined
): { hour: number; minute: number }[] {
  if (count <= 0) return [];
  const isBusy = isBusyFactory(busyStart, busyEnd);
  const available: number[] = [];
  for (let m = 0; m < 1440; m++) if (!isBusy(m)) available.push(m);
  if (available.length === 0) return [];

  const circularDiff = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 1440 - d);
  };
  const minGap = Math.max(20, Math.floor(available.length / (count * 2)));

  const chosen: number[] = [];
  let attempts = 0;
  while (chosen.length < count && attempts < count * 300) {
    const candidate = available[Math.floor(Math.random() * available.length)];
    if (chosen.every((c) => circularDiff(c, candidate) >= minGap)) chosen.push(candidate);
    attempts++;
  }
  // Relax the gap constraint to guarantee we always return `count` times.
  while (chosen.length < count) {
    chosen.push(available[Math.floor(Math.random() * available.length)]);
  }
  chosen.sort((a, b) => a - b);
  return chosen.map((min) => ({ hour: Math.floor(min / 60), minute: min % 60 }));
}

export async function cancelAllReminders() {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier?.startsWith(ID_PREFIX))
        .map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {}
}

// ------------------- Daily Streak Reminder -------------------
// A single, always-free "don't break your streak" nudge — deliberately separate from the
// per-manifestation Reminder Center above (up to 10x/day + busy-hours, premium-gated). This is
// one simple daily repeating local notification at a user-chosen time, managed independently
// so toggling/rescheduling it never touches the ritual-reminder schedule above.
const STREAK_REMINDER_ID = "mtree-streak-reminder";
const STREAK_TITLE = "🔥 Don't Break Your Streak!";
const STREAK_BODY = "Complete today's ritual before the day ends to keep your streak alive.";

export async function cancelStreakReminder() {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {}
}

// Schedules (replacing any previous one) a daily repeating local notification at `time`
// ("HH:MM", 24h). Returns whether it actually got OS-scheduled + the resulting permission
// state, mirroring rescheduleReminders() above so callers can surface a clear notice when
// notifications are blocked at the OS level instead of silently doing nothing.
export async function scheduleStreakReminder(
  time: string
): Promise<{ scheduled: boolean; permission: NotificationPermissionState }> {
  if (!Notifications) return { scheduled: false, permission: "unavailable" };
  await cancelStreakReminder();
  const granted = await requestNotificationPermissions();
  if (!granted) return { scheduled: false, permission: await getNotificationPermissionState() };
  const [h, m] = (time || "20:00").split(":").map(Number);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: STREAK_TITLE,
        body: STREAK_BODY,
        sound: true,
        data: { type: "streak-reminder" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: h,
        minute: m,
        repeats: true,
      } as any,
    });
  } catch {
    return { scheduled: false, permission: "granted" };
  }
  return { scheduled: true, permission: "granted" };
}

// Clears any previously scheduled mTree reminders and re-schedules local daily repeating
// notifications. In "custom" mode, `customTimes` (HH:MM strings) are used verbatim; otherwise
// `count` random times are generated, always excluding the busy/Do-Not-Disturb window. Safe to
// call anytime the user's reminder settings change, or on app launch as a refresh safety net.
// Returns whether reminders actually got OS-scheduled + the resulting permission state, so
// callers can surface a clear "notifications are off" notice instead of silently doing nothing.
export async function rescheduleReminders(
  count: number,
  busyStart: string | null | undefined,
  busyEnd: string | null | undefined,
  mode: "random" | "custom" = "random",
  customTimes: string[] = []
): Promise<{ scheduled: boolean; permission: NotificationPermissionState }> {
  if (!Notifications) return { scheduled: false, permission: "unavailable" };
  await cancelAllReminders();
  if (!count || count <= 0) return { scheduled: false, permission: await getNotificationPermissionState() };
  const granted = await requestNotificationPermissions();
  if (!granted) return { scheduled: false, permission: await getNotificationPermissionState() };

  const times =
    mode === "custom" && customTimes.length > 0
      ? customTimes.slice(0, count).map((t) => {
          const [h, m] = t.split(":").map(Number);
          return { hour: h, minute: m };
        })
      : computeRandomReminderTimes(count, busyStart, busyEnd);

  try {
    await Promise.all(
      times.map((t, i) =>
        Notifications!.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${i}`,
          content: {
            title: "🕉️ Your Daily Ritual Awaits",
            body: RITUAL_BODY,
            sound: true,
            data: { type: "ritual-reminder" },
          },
          trigger: {
            type: Notifications!.SchedulableTriggerInputTypes.DAILY,
            hour: t.hour,
            minute: t.minute,
            repeats: true,
          } as any,
        })
      )
    );
  } catch {
    return { scheduled: false, permission: "granted" };
  }
  return { scheduled: true, permission: "granted" };
}
