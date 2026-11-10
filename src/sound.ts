// The app's own alarm sound, used while the app is open: on the ring screen, and
// quietly during a mission (full volume again if you stop answering).
// It plays the song or file picked in Settings, or the built-in tone.
import { AudioPlayer, AudioSource, createAudioPlayer, setAudioModeAsync } from "expo-audio";

let player: AudioPlayer | null = null;
let source: string | null = null; // file uri of the picked sound, or null for the built-in tone

export function setAlarmSource(uri: string | null): void {
  source = uri || null;
}

function alarmSource(): AudioSource {
  return source ? { uri: source } : require("../assets/alarm.wav");
}

export async function startAlarm(volume = 1): Promise<void> {
  stopPreview();
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: true });
    if (!player) {
      try {
        player = createAudioPlayer(alarmSource());
      } catch {
        player = createAudioPlayer(require("../assets/alarm.wav"));
      }
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

// A short listen in Settings.
let preview: AudioPlayer | null = null;

export async function playPreview(src: AudioSource | null): Promise<void> {
  stopPreview();
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix", shouldPlayInBackground: false });
    preview = createAudioPlayer(src ?? require("../assets/alarm.wav"));
    preview.volume = 0.8;
    preview.play();
  } catch {
    preview = null;
  }
}

export function stopPreview(): void {
  if (!preview) return;
  try {
    preview.pause();
    preview.remove();
  } catch {}
  preview = null;
}
