// Native alarm: AlarmKit on iPhone (iOS 26+), AlarmManager + a ringing foreground service on Android.
// Every call is safe when the native module is missing (Expo Go): alarms just report unavailable.
import Native, { AlarmPermission } from './src/WakeAlarmModule';

export type { AlarmPermission };

export function isAvailable(): boolean {
  try {
    return !!Native && Native.isSupported();
  } catch {
    return false;
  }
}

export function getPermission(): AlarmPermission {
  return isAvailable() ? Native!.getPermission() : 'unavailable';
}

export async function requestPermission(): Promise<AlarmPermission> {
  return isAvailable() ? Native!.requestPermission() : 'unavailable';
}

export async function scheduleDaily(hour: number, minute: number, title: string): Promise<void> {
  if (!isAvailable()) throw new Error("Alarms aren't available in this build.");
  await Native!.scheduleDaily(hour, minute, title);
}

export async function scheduleTest(seconds: number, title: string): Promise<void> {
  if (!isAvailable()) throw new Error("Alarms aren't available in this build.");
  await Native!.scheduleTest(seconds, title);
}

export async function cancelAll(): Promise<void> {
  if (isAvailable()) await Native!.cancelAll();
}

/** Epoch ms of the alarm that still needs a finished mission, or null. */
export function getOwedRing(): number | null {
  if (!isAvailable()) return null;
  const at = Native!.getOwedRing();
  return at > 0 ? at : null;
}

export function missionStarted(): void {
  if (isAvailable()) Native!.missionStarted();
}
export function missionHeartbeat(): void {
  if (isAvailable()) Native!.missionHeartbeat();
}
export function missionComplete(): void {
  if (isAvailable()) Native!.missionComplete();
}
export function openSettings(): void {
  if (isAvailable()) Native!.openSettings();
}
