// Puts the picked alarm sound where the alarm can reach it: a copy in the app's own
// files, so the Android alarm service can play it even when the app is closed.
import { Asset } from "expo-asset";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as WakeAlarm from "../modules/wake-alarm";
import { songById } from "./songs";
import { setAlarmSource } from "./sound";

export type SoundChoice = { sound: string; soundUri?: string; soundName?: string };

async function copyIn(fromUri: string, name: string): Promise<string> {
  const dest = new File(Paths.document, name);
  if (dest.exists) dest.delete();
  await new File(fromUri).copy(dest, { overwrite: true });
  return dest.uri;
}

// A bundled song: "phone" means the phone's own alarm sound.
export async function chooseSong(id: string): Promise<SoundChoice> {
  if (id === "phone") return apply({ sound: "phone" });
  const song = songById(id);
  if (!song) return apply({ sound: "phone" });
  const asset = await Asset.fromModule(song.file).downloadAsync();
  if (!asset.localUri) throw new Error("song not available");
  const uri = await copyIn(asset.localUri, `alarm-song.${asset.type || "mp3"}`);
  return apply({ sound: id, soundUri: uri, soundName: song.title });
}

// Your own audio file. Returns null if you cancel.
export async function pickOwnSound(): Promise<SoundChoice | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const ext = (a.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] || "mp3").toLowerCase();
  const uri = await copyIn(a.uri, `alarm-own-${Date.now()}.${ext}`);
  // Clear out older picks.
  try {
    for (const f of Paths.document.list()) {
      if (f instanceof File && f.name.startsWith("alarm-own-") && f.uri !== uri) f.delete();
    }
  } catch {}
  return apply({ sound: "custom", soundUri: uri, soundName: a.name.replace(/\.[^.]+$/, "") });
}

// Tells the alarm (native and in-app) which sound to play.
export function apply(c: SoundChoice): SoundChoice {
  const uri = c.sound === "phone" ? "" : c.soundUri || "";
  WakeAlarm.setSound(uri);
  setAlarmSource(uri || null);
  return c;
}
