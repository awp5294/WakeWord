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
    player.volume = volume;
    player.play();
  } catch {
    // No audio: the native alarm still rings.
  }
}

export function setAlarmVolume(volume: number): void {
  if (player) player.volume = volume;
}

export function stopAlarm(): void {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {}
  player = null;
}
