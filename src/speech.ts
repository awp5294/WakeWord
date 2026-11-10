// Text-to-speech for listening tasks, and speech recognition for "say it" tasks when the build has it.
import { requireOptionalNativeModule } from "expo";
import * as Speech from "expo-speech";
import { Linking, Platform } from "react-native";
import { duckAlarm } from "./sound";

// The voice picked in Settings for each language ("it-IT" -> voice identifier). Empty means automatic.
let chosen: Record<string, string | undefined> = {};
export function setVoicePrefs(prefs: Record<string, string | undefined>): void {
  chosen = { ...prefs };
}

export type VoiceOption = { id: string; label: string; enhanced: boolean };

const cache: Record<string, Speech.Voice[]> = {};

// Higher is better: the right accent, then the phone's higher-quality voices.
function score(v: Speech.Voice, tts: string): number {
  const id = `${v.identifier} ${v.name}`.toLowerCase();
  let n = 0;
  if (v.language.toLowerCase() === tts.toLowerCase()) n += 4;
  if (v.quality === Speech.VoiceQuality.Enhanced) n += 3;
  if (id.includes("premium")) n += 4;
  if (id.includes("enhanced")) n += 2;
  if (id.includes("local")) n += 1; // works without internet
  if (id.includes("compact") || id.includes("eloquence")) n -= 2;
  return n;
}

/** Voices on this phone for a language (like "it-IT"), best first. */
export async function voicesFor(tts: string): Promise<Speech.Voice[]> {
  if (cache[tts]) return cache[tts];
  const lang = tts.split("-")[0].toLowerCase();
  try {
    const all = await Speech.getAvailableVoicesAsync();
    const list = all
      .filter((v) => v.language.toLowerCase().replace("_", "-").split("-")[0] === lang)
      .sort((a, b) => score(b, tts) - score(a, tts) || a.name.localeCompare(b.name));
    if (list.length) cache[tts] = list;
    return list;
  } catch {
    return [];
  }
}

/** Short names for the Settings chips: "Voice 1", "Voice 2"... in best-first order. */
export async function voiceOptions(tts: string, max = 6): Promise<VoiceOption[]> {
  const list = (await voicesFor(tts)).slice(0, max);
  return list.map((v, i) => {
    const enhanced = v.quality === Speech.VoiceQuality.Enhanced || /premium|enhanced/i.test(v.identifier);
    // iOS names voices (Alice, Federica); Android gives codes like it-it-x-itd-local.
    const named = Platform.OS === "ios" && /^[A-Za-z]/.test(v.name) && !v.name.includes("-") ? v.name : `Voice ${i + 1}`;
    return { id: v.identifier, label: named, enhanced };
  });
}

async function pick(tts: string): Promise<string | undefined> {
  const list = await voicesFor(tts);
  const want = chosen[tts];
  if (want && list.some((v) => v.identifier === want)) return want;
  return list[0]?.identifier;
}

let speaking = 0;
export async function speak(text: string, tts: string, voiceId?: string): Promise<void> {
  Speech.stop();
  const voice = voiceId ?? (await pick(tts));
  const id = ++speaking;
  const done = () => {
    if (id === speaking) duckAlarm(false);
  };
  duckAlarm(true);
  Speech.speak(text, {
    // Android only understands the bare language code here ("it", not "it-IT");
    // the full tag made it fall back to the phone's own language.
    language: Platform.OS === "android" ? tts.split("-")[0] : tts,
    voice,
    rate: 0.9,
    pitch: 1,
    onDone: done,
    onStopped: done,
    onError: done,
  });
}

/** Opens the phone's text-to-speech settings (Android), to switch engine or download a voice. */
export function openVoiceSettings(): void {
  if (Platform.OS !== "android") return;
  Linking.sendIntent("com.android.settings.TTS_SETTINGS").catch(() => Linking.openSettings());
}

type RecognitionResult = { results: { transcript: string }[]; isFinal: boolean };
type Recognizer = {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: { lang: string; interimResults: boolean; continuous: boolean; contextualStrings?: string[] }): void;
  stop(): void;
  abort(): void;
  addListener(event: string, cb: (e: any) => void): { remove(): void };
};

// Missing in Expo Go: "say it" tasks then fall back to tapping "I said it" three times.
const recognizer = requireOptionalNativeModule<Recognizer>("ExpoSpeechRecognition");

export const canRecognize = !!recognizer;

export async function listen(
  lang: string,
  hint: string,
  onText: (text: string, final: boolean) => void,
  onEnd: (error?: string) => void,
): Promise<() => void> {
  if (!recognizer) {
    onEnd("unavailable");
    return () => {};
  }
  const perm = await recognizer.requestPermissionsAsync();
  if (!perm.granted) {
    onEnd("not-allowed");
    return () => {};
  }
  const subs = [
    recognizer.addListener("result", (e: RecognitionResult) => onText(e.results.map((r) => r.transcript).join(" "), e.isFinal)),
    recognizer.addListener("error", (e: { error: string }) => onEnd(e.error)),
    recognizer.addListener("end", () => onEnd()),
  ];
  recognizer.start({ lang, interimResults: true, continuous: false, contextualStrings: [hint] });
  return () => {
    subs.forEach((s) => s.remove());
    try {
      recognizer.abort();
    } catch {}
  };
}
