// Calm dawn palette at rest; the ringing screen floods with sunrise orange. Same tokens as the web version.
import { useColorScheme } from "react-native";

const light = {
  bg: "#eef2f7", surface: "#ffffff", surface2: "#e3e9f1", fg: "#131c2b", muted: "#5a6779", line: "#d3dbe6",
  accent: "#e2561f", accentInk: "#ffffff", accentSoft: "#fde3d6", good: "#1d7a4f", goodSoft: "#dcf1e6",
  bad: "#b8322a", badSoft: "#f8dedb", ring: "#e2561f", ringInk: "#1a0b03",
};
const dark: typeof light = {
  bg: "#0d1420", surface: "#162031", surface2: "#1e2a3e", fg: "#e7edf5", muted: "#95a3b8", line: "#2a374d",
  accent: "#ff7a3d", accentInk: "#1a0d05", accentSoft: "#3a2117", good: "#4cc68a", goodSoft: "#15301f",
  bad: "#ff7b6f", badSoft: "#3a1b18", ring: "#ff7a3d", ringInk: "#1a0b03",
};
export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
