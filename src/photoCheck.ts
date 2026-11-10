// Photo hunts: shrink the photo and ask the photo-check server (see photo-check/) whether it shows the word.
// With no server set up, the learner confirms the photo themselves.
import Constants from "expo-constants";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const extra = (Constants.expoConfig?.extra || {}) as { photoCheckUrl?: string; photoCheckToken?: string };
export const PHOTO_CHECK_URL = extra.photoCheckUrl || "";

export type PhotoVerdict = { ok: boolean; reason: string } | { error: string };

export async function shrink(uri: string): Promise<{ uri: string; base64: string }> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 768 }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return { uri: out.uri, base64: out.base64 || "" };
}

export async function checkPhoto(base64: string, word: string, english: string, language: string): Promise<PhotoVerdict> {
  if (!PHOTO_CHECK_URL) return { error: "no-server" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(PHOTO_CHECK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(extra.photoCheckToken ? { "x-wakeword-token": extra.photoCheckToken } : {}) },
      body: JSON.stringify({ image: base64, word, english, language }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || typeof data.ok !== "boolean") return { error: data.error || "Check failed" };
    return { ok: data.ok, reason: String(data.reason || "") };
  } catch {
    return { error: "Couldn't reach the photo check" };
  } finally {
    clearTimeout(timer);
  }
}
