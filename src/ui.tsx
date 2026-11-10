import React from "react";
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Palette } from "./theme";

type BtnProps = {
  p: Palette;
  label: string;
  onPress: () => void;
  kind?: "primary" | "plain" | "ghost" | "link";
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
};

export function Btn({ p, label, onPress, kind = "plain", disabled, style, textStyle, accessibilityLabel }: BtnProps) {
  const bg = kind === "primary" ? p.accent : kind === "plain" ? p.surface2 : "transparent";
  const fg = kind === "primary" ? p.accentInk : kind === "link" ? p.muted : p.fg;
  const border = kind === "primary" ? p.accent : kind === "link" ? "transparent" : p.line;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        kind === "link" && s.link,
        style,
      ]}
    >
      <Text style={[s.btnText, { color: fg }, kind === "link" && s.linkText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ p, children, style }: { p: Palette; children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, { backgroundColor: p.surface, borderColor: p.line }, style]}>{children}</View>;
}

export function Label({ p, children }: { p: Palette; children: React.ReactNode }) {
  return <Text style={[s.label, { color: p.muted }]}>{children}</Text>;
}

export function Kind({ p, children }: { p: Palette; children: React.ReactNode }) {
  return <Text style={[s.kind, { color: p.accent }]}>{children}</Text>;
}

// A row of choices, one selected.
export function Chips<T extends string | number>({
  p, value, options, onChange, label,
}: { p: Palette; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <View style={s.field}>
      <Label p={p}>{label}</Label>
      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[s.chip, { backgroundColor: on ? p.accent : p.surface2, borderColor: on ? p.accent : p.line }]}
            >
              <Text style={[s.chipText, { color: on ? p.accentInk : p.fg }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  link: { minHeight: 40, paddingVertical: 8, borderWidth: 0 },
  linkText: { fontWeight: "500", textDecorationLine: "underline" },
  card: { borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 1, fontWeight: "600" },
  kind: { fontSize: 13, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  field: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 15, fontWeight: "600" },
});
