import { NativeModule, requireOptionalNativeModule } from 'expo';

export type AlarmPermission =
  | 'granted'
  | 'denied'
  | 'notDetermined'
  | 'unavailable'
  | 'needsExactAlarms'
  | 'needsFullScreen';

declare class WakeAlarmNative extends NativeModule<{}> {
  isSupported(): boolean;
  getPermission(): AlarmPermission;
  requestPermission(): Promise<AlarmPermission>;
  scheduleDaily(hour: number, minute: number, title: string): Promise<void>;
  scheduleTest(seconds: number, title: string): Promise<void>;
  cancelAll(): Promise<void>;
  getOwedRing(): number;
  missionStarted(): void;
  missionHeartbeat(): void;
  missionComplete(): void;
  openSettings(): void;
}

// Missing in Expo Go and on web: the app then runs missions for practice only.
export default requireOptionalNativeModule<WakeAlarmNative>('WakeAlarm');
