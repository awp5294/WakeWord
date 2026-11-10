// The app's own alarm sound, used while the app is open: on the ring screen, and
// quietly during a mission (full volume again if you stop answering).
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

let player: AudioPlayer | null = null;

export async function startAlarm(volume = 1): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: true });
    if (!player) {
      player = createAudioPlayer(require("../assets/alarm.wav"));
      player.loop = true;
    }
    level = volume;
    player.volume = ducked ? Math.min(volume, 0.03) : volume;
    player.play();
  } catch {
    // No audio: the native alarm still rings.
  }
}

let level = 1;
let ducked = false;

export function setAlarmVolume(volume: number): void {
  level = volume;
  if (player && !ducked) player.volume = volume;
}

// Drops the alarm sound while a word is being spoken, so you can hear it.
export function duckAlarm(on: boolean): void {
  ducked = on;
  if (player) player.volume = on ? Math.min(level, 0.03) : level;
}

export function stopAlarm(): void {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {}
  player = null;
}
