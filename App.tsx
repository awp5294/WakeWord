import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as WakeAlarm from "./modules/wake-alarm";
import { DECKS, LANGS } from "./src/decks";
import Home from "./src/Home";
import { buildMission, currentStreak, dayKey, daysBetween, finishMission, formatTime, langProgress, Mission, State } from "./src/logic";
import MissionScreen, { Finished } from "./src/Mission";
import { startAlarm, stopAlarm } from "./src/sound";
import { setVoicePrefs } from "./src/speech";
import { loadState, saveState } from "./src/storage";
import { Palette, usePalette } from "./src/theme";
import { Btn, Card } from "./src/ui";

type View_ = "home" | "ring" | "mission" | "done";
type Running = { mission: Mission; day: string; alarm: boolean };
type DoneInfo = { alarm: boolean; secs: number; results: { i: number; ok: boolean }[]; day: string };

const KEEP_AWAKE = "wakeword";

// Tell the speech helper which voice was picked for each language.
function syncVoices(s: State) {
  setVoicePrefs(Object.fromEntries(LANGS.map((l) => [DECKS[l].tts, s.settings.voices[l]])));
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const p = usePalette();
  const [state, setState] = useState<State | null>(null);
  const [view, setView] = useState<View_>("home");
  const [running, setRunning] = useState<Running | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [alarmNote, setAlarmNote] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [, bump] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const save = useCallback(() => {
    if (state) saveState(state);
  }, [state]);

  const change = (fn: (s: State) => void) => {
    if (!state) return;
    fn(state);
    syncVoices(state);
    saveState(state);
    bump((n) => n + 1);
  };

  // If an alarm went off and its mission isn't done, go straight to the ringing screen.
  const checkOwed = useCallback(() => {
    if (viewRef.current === "ring" || viewRef.current === "mission") return;
    if (WakeAlarm.getOwedRing()) {
      setView("ring");
      startAlarm(1);
      WakeAlarm.missionStarted();
      activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadState().then((s) => {
      syncVoices(s);
      setState(s);
      checkOwed();
    });
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") checkOwed();
    });
    return () => sub.remove();
  }, [checkOwed]);

  if (!state) {
    return (
      <View style={[st.center, { backgroundColor: p.bg }]}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }
  const lang = state.settings.lang;

  const begin = (alarm: boolean) => {
    const day = dayKey();
    const mission = buildMission(state, lang, day, { say: true, tts: true });
    saveState(state);
    setRunning({ mission, day, alarm });
    setView("mission");
  };

  const onFinish = (f: Finished) => {
    if (!running) return;
    finishMission(state, running.day, { lang, tasks: f.tasks, right: f.right, wrong: f.wrong, secs: f.secs, alarm: running.alarm });
    saveState(state);
    if (running.alarm) {
      WakeAlarm.missionComplete();
      stopAlarm();
      deactivateKeepAwake(KEEP_AWAKE).catch(() => {});
    }
    setDone({ alarm: running.alarm, secs: f.secs, results: f.results, day: running.day });
    setRunning(null);
    setView("done");
  };

  const schedule = async (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    await WakeAlarm.scheduleDaily(h, m, `Wake Word: ${DECKS[state.settings.lang].hello}!`);
  };

  // Ask for what the alarm needs. Returns true when it can ring.
  const ensurePermission = async (): Promise<boolean> => {
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        setAlarmNote("The alarm needs notifications to ring. Turn them on for Wake Word in Settings.");
        setShowSettings(true);
        return false;
      }
    }
    const perm = await WakeAlarm.requestPermission();
    setShowSettings(perm !== "granted");
    if (perm === "granted") return true;
    const notes: Record<string, string> = {
      denied: "Wake Word isn't allowed to set alarms. Turn on Alarms for Wake Word in Settings.",
      needsExactAlarms: "Allow Wake Word to set alarms and reminders in Settings, then switch the alarm on again.",
      needsFullScreen: "Allow full-screen alerts for Wake Word in Settings so the alarm can show over the lock screen.",
      unavailable: "Alarms need iOS 26 or later on iPhone.",
      notDetermined: "Wake Word needs permission to set alarms.",
    };
    setAlarmNote(notes[perm] || "The alarm can't be set right now.");
    return false;
  };

  const onToggleAlarm = async (on: boolean) => {
    if (!on) {
      await WakeAlarm.cancelAll();
      change((s) => { s.settings.enabled = false; });
      setAlarmNote("");
      setShowSettings(false);
      return;
    }
    if (!(await ensurePermission())) return;
    try {
      await schedule(state.settings.alarm);
      change((s) => { s.settings.enabled = true; });
      setAlarmNote("");
    } catch (e) {
      setAlarmNote(`The alarm couldn't be set: ${(e as Error).message}`);
    }
  };

  const onTimeChange = async (hhmm: string) => {
    change((s) => { s.settings.alarm = hhmm; });
    if (state.settings.enabled) {
      try {
        await schedule(hhmm);
      } catch (e) {
        setAlarmNote(`The alarm couldn't be moved: ${(e as Error).message}`);
      }
    }
  };

  const onTestAlarm = async () => {
    if (!(await ensurePermission())) return;
    try {
      await WakeAlarm.scheduleTest(60, `Wake Word: ${DECKS[lang].hello}!`);
      const at = new Date(Date.now() + 60000);
      setAlarmNote(`Test alarm at ${formatTime(`${at.getHours()}:${at.getMinutes()}`)}. Lock your phone to see it ring.`);
    } catch (e) {
      setAlarmNote(`The test alarm couldn't be set: ${(e as Error).message}`);
    }
  };

  const dark = view === "ring" ? "dark" : "auto";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: view === "ring" ? p.ring : p.bg }}>
      <StatusBar style={dark} />
      {view === "home" && (
        <Home
          p={p}
          state={state}
          alarmNote={alarmNote}
          showSettings={showSettings}
          onOpenSettings={() => WakeAlarm.openSettings()}
          onChange={change}
          onToggleAlarm={onToggleAlarm}
          onTimeChange={onTimeChange}
          onTestAlarm={onTestAlarm}
          onPractice={() => begin(false)}
        />
      )}
      {view === "ring" && <Ring p={p} state={state} onStart={() => begin(true)} />}
      {view === "mission" && running && (
        <MissionScreen
          p={p}
          state={state}
          lang={lang}
          mission={running.mission}
          day={running.day}
          alarm={running.alarm}
          save={save}
          onFinish={onFinish}
          onQuit={() => {
            setRunning(null);
            setView("home");
          }}
        />
      )}
      {view === "done" && done && <Done p={p} state={state} info={done} onHome={() => setView("home")} />}
    </SafeAreaView>
  );
}

function Ring({ p, state, onStart }: { p: Palette; state: State; onStart: () => void }) {
  const d = DECKS[state.settings.lang];
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={[st.ring, { backgroundColor: p.ring }]}>
      <Text style={[st.clock, { color: p.ringInk }]}>{formatTime(`${now.getHours()}:${now.getMinutes()}`).replace(/ (AM|PM)$/, "")}</Text>
      <Text style={[st.hello, { color: p.ringInk }]} accessibilityRole="header">{d.hello}</Text>
      <Text style={{ color: p.ringInk, fontSize: 18, textAlign: "center" }}>
        Finish {state.settings.count} quick {d.name} tasks to stop the alarm.
      </Text>
      <Btn p={p} label="Start" onPress={onStart} style={{ backgroundColor: p.ringInk, borderColor: p.ringInk, minHeight: 60, alignSelf: "stretch" }} textStyle={{ color: "#fff", fontSize: 19 }} />
    </View>
  );
}

function Done({ p, state, info, onHome }: { p: Palette; state: State; info: DoneInfo; onHome: () => void }) {
  const lang = state.settings.lang;
  const d = DECKS[lang];
  const streak = currentStreak(state, info.day);
  const time = `${info.secs >= 60 ? Math.floor(info.secs / 60) + " min " : ""}${info.secs % 60} sec`;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={st.wrap}>
      <View style={{ alignItems: "center", gap: 6, paddingVertical: 12 }}>
        <Text style={{ color: p.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" }}>
          {info.alarm ? "Alarm off" : "Mission done"}
        </Text>
        <Text style={{ color: p.accent, fontSize: 40, fontWeight: "800" }}>{d.hello}!</Text>
        <Text style={{ color: p.fg, fontSize: 16, textAlign: "center" }}>
          {info.alarm ? "Alarm off in " : "Done in "}
          {time}. Streak: {streak} {streak === 1 ? "day" : "days"}.
        </Text>
      </View>
      <Card p={p}>
        <Text style={{ color: p.fg, fontSize: 19, fontWeight: "700" }}>Today's words</Text>
        {info.results.map((r) => {
          const w = d.words[r.i];
          const ws = langProgress(state, lang).words[r.i];
          const gap = ws ? daysBetween(info.day, ws.due) : 1;
          return (
            <View key={r.i} style={[st.row, { borderBottomColor: p.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.fg, fontWeight: "600" }}>{w.w}</Text>
                <Text style={{ color: p.muted, fontSize: 13 }}>{w.e}</Text>
              </View>
              <Text style={[st.pill, { backgroundColor: r.ok ? p.goodSoft : p.accentSoft, color: r.ok ? p.good : p.fg }]}>
                {r.ok ? "Got it" : "Missed"} · back {gap === 1 ? "tomorrow" : `in ${gap} days`}
              </Text>
            </View>
          );
        })}
        {info.alarm && state.settings.enabled && (
          <Text style={{ color: p.muted, fontSize: 14 }}>Your alarm rings again tomorrow at {formatTime(state.settings.alarm)}.</Text>
        )}
      </Card>
      <Btn p={p} kind="primary" label="Done" onPress={onHome} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  wrap: { padding: 16, paddingTop: 20, paddingBottom: 48, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  ring: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22, padding: 24 },
  clock: { fontSize: 96, fontWeight: "700", letterSpacing: -3, fontVariant: ["tabular-nums"] },
  hello: { fontSize: 34, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  pill: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
});
