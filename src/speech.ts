// Text-to-speech for listening tasks, and speech recognition for "say it" tasks when the build has it.
import { requireOptionalNativeModule } from "expo";
import * as Speech from "expo-speech";

export function speak(text: string, language: string): void {
  Speech.stop();
  Speech.speak(text, { language, rate: 0.85 });
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
