import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as WakeAlarm from "../modules/wake-alarm";
import { DECKS, LANGS, Lang } from "./decks";
import { currentStreak, dayKey, formatTime, langProgress, Level, State, stats } from "./logic";
import { PHOTO_CHECK_URL } from "./photoCheck";
import { openVoiceSettings, speak, VoiceOption, voiceOptions } from "./speech";
import { Btn, Card, Chips, Label } from "./ui";
import { Palette } from "./theme";

type Props = {
  p: Palette;
  state: State;
  alarmNote: string;
  showSettings: boolean;
  onOpenSettings: () => void;
  onChange: (fn: (s: State) => void) => void;
  onToggleAlarm: (on: boolean) => void;
  onTimeChange: (hhmm: string) => void;
  onTestAlarm: () => void;
  onPractice: () => void;
};

export default function Home({ p, state, alarmNote, showSettings, onOpenSettings, onChange, onToggleAlarm, onTimeChange, onTestAlarm, onPractice }: Props) {
  const set = state.settings;
  const d = DECKS[set.lang];
  const today = dayKey();
  const st = stats(state, set.lang, today);
  const streak = currentStreak(state, today);
  const [picking, setPicking] = useState(false);
  const native = WakeAlarm.isAvailable();

  const pickerDate = (() => {
    const [h, m] = set.alarm.split(":").map(Number);
    const x = new Date();
    x.setHours(h, m, 0, 0);
    return x;
  })();
  const onPick = (e: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setPicking(false);
    if (e.type === "dismissed" || !date) return;
    onTimeChange(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={s.wrap}>
      <View style={s.top}>
        <Text style={[s.h1, { color: p.fg }]} accessibilityRole="header">Wake Word</Text>
        <Text style={[s.chip, { backgroundColor: p.accentSoft, color: p.fg }]}>{d.name}</Text>
      </View>

      <Card p={p}>
        <View style={s.rowSpread}>
          <Label p={p}>Alarm</Label>
          {native && (
            <Switch
              value={set.enabled}
              onValueChange={onToggleAlarm}
              trackColor={{ true: p.accent, false: p.line }}
              accessibilityLabel="Alarm on"
            />
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Alarm time ${formatTime(set.alarm)}. Change`} onPress={() => setPicking(true)}>
          <Text style={[s.time, { color: set.enabled || !native ? p.fg : p.muted }]}>{formatTime(set.alarm)}</Text>
        </Pressable>
        {picking && (
          <DateTimePicker value={pickerDate} mode="time" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onPick} />
        )}
        {picking && Platform.OS === "ios" && <Btn p={p} label="Done" onPress={() => setPicking(false)} />}
        <Text style={{ color: p.muted, fontSize: 14 }}>
          Rings every day, even on silent. To turn it off you finish a short mission in {d.name}.
        </Text>
        {!!alarmNote && <Text style={[s.note, { color: p.muted, borderLeftColor: p.accent }]}>{alarmNote}</Text>}
        {showSettings && <Btn p={p} label="Open settings" onPress={onOpenSettings} />}
        {native ? (
          <Btn p={p} label="Test: ring in 1 minute" onPress={onTestAlarm} />
        ) : (
          <Text style={[s.note, { color: p.muted, borderLeftColor: p.accent }]}>
            This build can’t set alarms (Expo Go or web). Missions work for practice. Install the full app to get the alarm.
          </Text>
        )}
      </Card>

      <Card p={p}>
        <View style={s.rowSpread}>
          <Text style={[s.h2, { color: p.fg }]}>Your progress</Text>
          {state.streak.best > 0 && <Text style={{ color: p.muted, fontSize: 14 }}>Best streak {state.streak.best}</Text>}
        </View>
        <View style={s.stats}>
          {[
            [streak, "day streak"],
            [st.learning, "words learning"],
            [st.known, "words known"],
          ].map(([n, l]) => (
            <View key={String(l)} style={[s.stat, { backgroundColor: p.surface2 }]}>
              <Text style={[s.statNum, { color: p.fg }]}>{n}</Text>
              <Text style={{ color: p.muted, fontSize: 13 }}>{l}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: p.muted, fontSize: 14 }}>
          {st.started === 0
            ? `${st.total} everyday ${d.name} words to learn. Your first ones come with the first mission.`
            : `${st.dueToday} due today, ${st.started} of ${st.total} words started.`}
        </Text>
        <Btn p={p} kind="primary" label="Try a mission now" onPress={onPractice} />
      </Card>

      <Card p={p}>
        <Text style={[s.h2, { color: p.fg }]}>Settings</Text>
        <Chips<Lang>
          p={p}
          label="Language"
          value={set.lang}
          options={LANGS.map((l) => ({ value: l, label: DECKS[l].name }))}
          onChange={(v) => onChange((x) => { x.settings.lang = v; })}
        />
        <VoicePicker p={p} lang={set.lang} value={set.voices[set.lang] || ""} onPick={(id) => onChange((x) => { x.settings.voices[set.lang] = id || undefined; })} />
        <Chips<Level>
          p={p}
          label="Level"
          value={set.level}
          options={[{ value: "beginner", label: "Brand new" }, { value: "intermediate", label: "Know some basics" }]}
          onChange={(v) => onChange((x) => { x.settings.level = v; })}
        />
        <Chips<number>
          p={p}
          label="Tasks per alarm"
          value={set.count}
          options={[3, 5, 7].map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => onChange((x) => { x.settings.count = v; })}
        />
        <Chips<number>
          p={p}
          label="New words a day"
          value={set.newPerDay}
          options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => onChange((x) => { x.settings.newPerDay = v; })}
        />
        <View style={s.rowSpread}>
          <Text style={{ color: p.fg, fontSize: 16, flex: 1 }}>Photo hunts (find the object and snap it)</Text>
          <Switch
            value={set.photos}
            onValueChange={(v) => onChange((x) => { x.settings.photos = v; })}
            trackColor={{ true: p.accent, false: p.line }}
            accessibilityLabel="Photo hunts"
          />
        </View>
        {set.photos && !PHOTO_CHECK_URL && (
          <Text style={{ color: p.muted, fontSize: 14 }}>No photo checker is set up, so you confirm your own photos.</Text>
        )}
        <Deck p={p} state={state} lang={set.lang} today={today} />
        <Research p={p} />
      </Card>
    </ScrollView>
  );
}

function VoicePicker({ p, lang, value, onPick }: { p: Palette; lang: Lang; value: string; onPick: (id: string) => void }) {
  const d = DECKS[lang];
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  useEffect(() => {
    let live = true;
    voiceOptions(d.tts).then((v) => live && setVoices(v));
    return () => {
      live = false;
    };
  }, [d.tts]);
  if (voices === null) return null;
  const sample = `${d.hello}! ${d.words[0].w}.`;
  const pickAndHear = (id: string) => {
    onPick(id);
    speak(sample, d.tts, id || voices[0]?.id);
  };
  return (
    <View style={{ gap: 6 }}>
      {voices.length > 1 ? (
        <Chips<string>
          p={p}
          label={`${d.name} voice`}
          value={value}
          options={[{ value: "", label: "Best" }, ...voices.map((v) => ({ value: v.id, label: v.enhanced ? `${v.label} ★` : v.label }))]}
          onChange={pickAndHear}
        />
      ) : (
        <Btn p={p} label={`Hear the ${d.name} voice`} onPress={() => speak(sample, d.tts)} />
      )}
      <Text style={{ color: p.muted, fontSize: 14 }}>
        {voices.length === 0
          ? `Your phone has no ${d.name} voice yet. Add one in your phone's text-to-speech settings.`
          : `Tap a voice to hear it. ★ marks the more natural ones.`}
        {Platform.OS === "android" ? " Still robotic? Pick Google as the speech engine and download its voice." : ""}
      </Text>
      {Platform.OS === "android" && <Btn p={p} kind="link" label="Open text-to-speech settings" onPress={openVoiceSettings} />}
    </View>
  );
}

function Expander({ p, title, children }: { p: Palette; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.expander, { borderTopColor: p.line }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.summary}>
        <Text style={{ color: p.fg, fontWeight: "600", fontSize: 16 }}>{open ? "▾" : "▸"} {title}</Text>
      </Pressable>
      {open && children}
    </View>
  );
}

function Deck({ p, state, lang, today }: { p: Palette; state: State; lang: Lang; today: string }) {
  const words = langProgress(state, lang).words;
  return (
    <Expander p={p} title="Word deck">
      {DECKS[lang].words.map((w, i) => {
        const ws = words[i];
        const label = !ws ? "Not yet" : ws.box >= 4 ? "Known" : ws.due <= today ? "Due today" : "Learning";
        const bg = !ws ? p.surface2 : ws.box >= 4 ? p.goodSoft : label === "Due today" ? p.accentSoft : p.surface2;
        const fg = ws && ws.box >= 4 ? p.good : !ws ? p.muted : p.fg;
        return (
          <View key={i} style={[s.deckRow, { borderBottomColor: p.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.fg, fontWeight: "600" }}>{w.w}</Text>
              <Text style={{ color: p.muted, fontSize: 13 }}>{w.e}</Text>
            </View>
            <Text style={[s.pill, { backgroundColor: bg, color: fg }]}>{label}</Text>
          </View>
        );
      })}
    </Expander>
  );
}

function Research({ p }: { p: Palette }) {
  const items: [string, string][] = [
    ["Spacing.", "Each word comes back after 1, 2, 4, 7, 14, then 30 days. Spreading reviews out beat cramming them in a 2026 study of 69 learners (Zheng, Nakata and others), and a 2026 review of 25 studies found the same for keeping words long term."],
    ["Recall, not rereading.", "Every task makes you pull the word out of memory. New words start with easy picks and listening, then move to fill-in-the-blank, typing it from English and photo hunts as they stick."],
    ["Say it out loud.", "Reading aloud gave the best recall of four study methods in Forrin and MacLeod's 2017 study, so some tasks ask you to say the word."],
    ["Do something with it.", "Learners remembered words better when they acted them out than when they only saw a picture (Repetto and others, 2017). Hunting down the real oven at 6 AM is the same idea."],
    ["Mixed and useful.", "Tasks and words are shuffled together, and the deck starts with everyday words you'll see in your own kitchen. A small set of common words covers most of what people say (Schmitt and others, 2017)."],
    ["Mistakes count.", "A miss sends the word back to day one, adds one more task, and brings the word back a few tasks later in an easier form."],
  ];
  return (
    <Expander p={p} title="How the learning works">
      {items.map(([b, t]) => (
        <Text key={b} style={{ color: p.fg, fontSize: 15, lineHeight: 22, marginBottom: 8 }}>
          <Text style={{ fontWeight: "700" }}>{b} </Text>
          {t}
        </Text>
      ))}
    </Expander>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 20, paddingBottom: 48, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { fontSize: 28, fontWeight: "800" },
  h2: { fontSize: 19, fontWeight: "700" },
  chip: { fontSize: 13, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden" },
  rowSpread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  time: { fontSize: 64, fontWeight: "800", letterSpacing: -1.5, fontVariant: ["tabular-nums"] },
  note: { fontSize: 14, borderLeftWidth: 3, paddingLeft: 10 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  statNum: { fontSize: 26, fontWeight: "800", fontVariant: ["tabular-nums"] },
  expander: { borderTopWidth: 1, paddingTop: 6 },
  summary: { minHeight: 44, justifyContent: "center" },
  deckRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  pill: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
});
