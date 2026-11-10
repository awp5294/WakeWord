// The mission: a few quick tasks in the target language. In alarm mode the alarm keeps
// sounding quietly while you work and gets loud again if you stop for 20 seconds.
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as WakeAlarm from "../modules/wake-alarm";
import { DECKS, Lang, Word } from "./decks";
import { checkSpoken, checkTyped, grade, Mission, onMiss, options, QueueItem, setTaskType, State, TASK_SECONDS, TaskType } from "./logic";
import { checkPhoto, PHOTO_CHECK_URL, shrink } from "./photoCheck";
import { setAlarmVolume } from "./sound";
import { canRecognize, listen, speak } from "./speech";
import { Btn, Card, Kind } from "./ui";
import { Palette } from "./theme";

export type Result = { i: number; ok: boolean };
export type Finished = { tasks: number; right: number; wrong: number; secs: number; results: Result[] };

type Props = {
  p: Palette;
  state: State;
  lang: Lang;
  mission: Mission;
  day: string;
  alarm: boolean;
  save: () => void;
  onFinish: (f: Finished) => void;
  onQuit: () => void;
};

type Answer = { ok: boolean; note?: string; timeUp?: boolean; added: boolean };

export default function MissionScreen({ p, state, lang, mission, day, alarm, save, onFinish, onQuit }: Props) {
  const deck = DECKS[lang];
  const [pos, setPos] = useState(0);
  const [intro, setIntro] = useState(mission.newWords.length > 0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [, bump] = useState(0);
  const graded = useRef<Record<number, boolean>>({});
  const results = useRef<Result[]>([]);
  const tally = useRef({ right: 0, wrong: 0 });
  const startedAt = useRef(0);
  const lastTouch = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
    lastTouch.current = Date.now();
  }, []);
  const [loud, setLoud] = useState(false);

  // Alarm mode: quiet while you work, loud after 20 idle seconds; tell the native alarm we're still here.
  useEffect(() => {
    if (!alarm) return;
    setAlarmVolume(0.12);
    const idle = setInterval(() => {
      const isLoud = Date.now() - lastTouch.current > 20000;
      setAlarmVolume(isLoud ? 1 : 0.12);
      setLoud(isLoud);
    }, 1000);
    const beat = setInterval(() => WakeAlarm.missionHeartbeat(), 45000);
    return () => {
      clearInterval(idle);
      clearInterval(beat);
    };
  }, [alarm]);

  const q: QueueItem | undefined = mission.queue[pos];
  const w: Word | undefined = q ? deck.words[q.i] : undefined;

  const finish = useCallback(() => {
    onFinish({
      tasks: mission.queue.length,
      right: tally.current.right,
      wrong: tally.current.wrong,
      secs: Math.round((Date.now() - startedAt.current) / 1000),
      results: results.current,
    });
  }, [mission, onFinish]);

  const respond = useCallback(
    (ok: boolean, note?: string, timeUp?: boolean) => {
      if (!q || answer) return;
      if (!q.retry && !graded.current[q.i]) {
        graded.current[q.i] = true;
        grade(state, lang, q.i, ok, day);
        results.current.push({ i: q.i, ok });
      }
      if (ok) tally.current.right++;
      else tally.current.wrong++;
      const added = ok ? false : onMiss(mission, pos);
      save();
      setAnswer({ ok, note, timeUp, added });
      if (ok && w) speak(w.w, deck.tts);
    },
    [q, w, answer, state, lang, day, mission, pos, save, deck.tts],
  );

  const next = () => {
    setAnswer(null);
    if (pos + 1 >= mission.queue.length) finish();
    else setPos(pos + 1);
  };

  const swapType = (type: TaskType) => {
    setTaskType(mission, pos, type);
    bump((n) => n + 1);
  };

  const touched = () => {
    lastTouch.current = Date.now();
    if (loud) {
      setAlarmVolume(0.12);
      setLoud(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: p.bg }}
        contentContainerStyle={st.wrap}
        keyboardShouldPersistTaps="handled"
        onTouchStart={touched}
      >
        <View style={st.top}>
          <View style={st.dots} accessibilityLabel={`Task ${Math.min(pos + 1, mission.queue.length)} of ${mission.queue.length}`}>
            {mission.queue.map((_, k) => (
              <View key={k} style={[st.dot, { backgroundColor: k < pos || (k === pos && answer) ? p.good : k === pos ? p.accent : p.line }]} />
            ))}
          </View>
          <Text style={{ color: p.muted, fontSize: 14 }}>
            {Math.min(pos + 1, mission.queue.length)} of {mission.queue.length}
          </Text>
        </View>

        {intro ? (
          <Intro p={p} lang={lang} ids={mission.newWords} onDone={() => {
            mission.newWords.forEach((i) => {
              const ws = state.progress[lang]?.words[i];
              if (ws) ws.seen = true;
            });
            save();
            setIntro(false);
          }} />
        ) : q && w ? (
          <>
            <TimerBar key={`${pos}-${q.type}`} p={p} seconds={TASK_SECONDS[q.type]} running={!answer} onTimeUp={() => respond(false, undefined, true)} />
            <Card p={p}>
              <Task key={`${pos}-${q.type}`} p={p} lang={lang} q={q} w={w} answered={!!answer} respond={respond} swapType={swapType} />
              {answer && (
                <Feedback p={p} w={w} answer={answer} tts={deck.tts} last={pos + 1 >= mission.queue.length} onNext={next} />
              )}
            </Card>
          </>
        ) : null}

        {alarm && loud && <Text style={[st.hint, { color: p.muted }]}>Keep going and the alarm gets quiet again.</Text>}
        {!alarm && <Btn p={p} kind="link" label="Stop practice" onPress={onQuit} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Intro({ p, lang, ids, onDone }: { p: Palette; lang: Lang; ids: number[]; onDone: () => void }) {
  const d = DECKS[lang];
  return (
    <Card p={p}>
      <Kind p={p}>{ids.length === 1 ? "New word" : "New words"}</Kind>
      <Text style={{ color: p.muted, fontSize: 16 }}>Take a look and say each one out loud. They’ll come up in a moment.</Text>
      {ids.map((i) => (
        <View key={i} style={[st.newword, { borderColor: p.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.newwordText, { color: p.fg }]}>{d.words[i].w}</Text>
            <Text style={{ color: p.muted }}>{d.words[i].e}</Text>
          </View>
          <Btn p={p} label="Hear it" onPress={() => speak(d.words[i].w, d.tts)} style={st.hear} accessibilityLabel={`Hear ${d.words[i].w}`} />
        </View>
      ))}
      <Btn p={p} kind="primary" label="Got it" onPress={onDone} />
    </Card>
  );
}

function TimerBar({ p, seconds, running, onTimeUp }: { p: Palette; seconds: number; running: boolean; onTimeUp: () => void }) {
  const end = useRef(0);
  const [left, setLeft] = useState(seconds * 1000);
  const fired = useRef(false);
  useEffect(() => {
    if (!running) return;
    if (!end.current) end.current = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const l = Math.max(0, end.current - Date.now());
      setLeft(l);
      if (l <= 0 && !fired.current) {
        fired.current = true;
        onTimeUp();
      }
    }, 250);
    return () => clearInterval(t);
  }, [running, onTimeUp, seconds]);
  return (
    <View style={[st.timer, { backgroundColor: p.surface2, opacity: running ? 1 : 0 }]}>
      <View style={{ height: "100%", width: `${(100 * left) / (seconds * 1000)}%`, backgroundColor: left < 8000 ? p.bad : p.accent }} />
    </View>
  );
}

type TaskProps = {
  p: Palette;
  lang: Lang;
  q: QueueItem;
  w: Word;
  answered: boolean;
  respond: (ok: boolean, note?: string) => void;
  swapType: (t: TaskType) => void;
};

function Task(props: TaskProps) {
  const { p, lang, q, w } = props;
  const d = DECKS[lang];
  switch (q.type) {
    case "pick":
      return <PickTask {...props} kind="What does it mean?" field="e" showWord autoSpeak />;
    case "listen":
      return <PickTask {...props} kind="Listen. What does it mean?" field="e" autoSpeak listenOnly />;
    case "fillpick":
      return <PickTask {...props} kind="Fill in the blank" field="b" sentence />;
    case "filltype":
      return <TypedTask {...props} kind="Fill in the blank" sentence />;
    case "type":
      return <TypedTask {...props} kind={`Say it in ${d.name}`} />;
    case "say":
      return <SayTask {...props} />;
    case "photo":
      return <PhotoTask {...props} />;
    default:
      return <Text style={{ color: p.fg }}>{w.w}</Text>;
  }
}

function Sentence({ p, w }: { p: Palette; w: Word }) {
  const [a, b] = w.s.split("___");
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.sentence, { color: p.fg }]}>
        {a}
        <Text style={{ color: p.accent, fontWeight: "700", textDecorationLine: "underline" }}>{"  ?  "}</Text>
        {b}
      </Text>
      <Text style={{ color: p.muted, fontSize: 14 }}>{w.t}</Text>
    </View>
  );
}

function WordRow({ p, w, tts }: { p: Palette; w: Word; tts: string }) {
  return (
    <View style={st.wordRow}>
      <Text style={[st.target, { color: p.fg }]}>{w.w}</Text>
      <Btn p={p} label="Hear it" onPress={() => speak(w.w, tts)} style={st.hear} accessibilityLabel={`Hear ${w.w}`} />
    </View>
  );
}

function PickTask({
  p, lang, q, w, answered, respond, kind, field, showWord, autoSpeak, listenOnly, sentence,
}: TaskProps & { kind: string; field: "e" | "b"; showWord?: boolean; autoSpeak?: boolean; listenOnly?: boolean; sentence?: boolean }) {
  const d = DECKS[lang];
  const ids = useMemo(() => options(lang, q.i, field, 4), [lang, q.i, field]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (autoSpeak) {
      const t = setTimeout(() => speak(w.w, d.tts), 150);
      return () => clearTimeout(t);
    }
  }, [autoSpeak, w.w, d.tts]);
  return (
    <View style={{ gap: 12 }}>
      <Kind p={p}>{kind}</Kind>
      {showWord && <WordRow p={p} w={w} tts={d.tts} />}
      {listenOnly && (
        <>
          <Btn p={p} kind="primary" label="Play again" onPress={() => speak(w.w, d.tts)} />
          {reveal ? <Text style={[st.target, { color: p.fg }]}>{w.w}</Text> : <Btn p={p} kind="link" label="Show the word" onPress={() => setReveal(true)} />}
        </>
      )}
      {sentence && <Sentence p={p} w={w} />}
      <View style={st.opts}>
        {ids.map((k) => {
          const right = answered && k === q.i;
          const wrong = answered && chosen === k && k !== q.i;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              disabled={answered}
              onPress={() => {
                setChosen(k);
                respond(k === q.i);
              }}
              style={[
                st.opt,
                { backgroundColor: right ? p.goodSoft : wrong ? p.badSoft : p.surface2, borderColor: right ? p.good : wrong ? p.bad : p.line },
              ]}
            >
              <Text style={[st.optText, { color: right ? p.good : wrong ? p.bad : p.fg }]}>{d.words[k][field]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TypedTask({ p, lang, w, answered, respond, kind, sentence }: TaskProps & { kind: string; sentence?: boolean }) {
  const d = DECKS[lang];
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim() || answered) return;
    const r = checkTyped(value, w);
    if (r === "exact") respond(true);
    else if (r === "accent") respond(true, `Right. Watch the spelling: ${w.w}.`);
    else if (r === "typo") respond(true, `Close enough. It's spelled ${w.w}.`);
    else respond(false, `You wrote “${value.trim()}.”`);
  };
  return (
    <View style={{ gap: 12 }}>
      <Kind p={p}>{kind}</Kind>
      {sentence ? (
        <Sentence p={p} w={w} />
      ) : (
        <>
          <Text style={{ color: p.muted, fontSize: 16 }}>Type the {d.name} for</Text>
          <Text style={[st.target, { color: p.fg }]}>{w.e}</Text>
        </>
      )}
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        editable={!answered}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="done"
        placeholder={`Type it in ${d.name}`}
        placeholderTextColor={p.muted}
        accessibilityLabel={sentence ? "Missing word" : `${d.name} word`}
        style={[st.input, { color: p.fg, backgroundColor: p.surface2, borderColor: p.line }]}
      />
      <Btn p={p} kind="primary" label="Check" onPress={submit} disabled={answered || !value.trim()} />
    </View>
  );
}

function SayTask({ p, lang, w, answered, respond }: TaskProps) {
  const d = DECKS[lang];
  const [mode, setMode] = useState<"mic" | "tap">(canRecognize ? "mic" : "tap");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [taps, setTaps] = useState(0);
  const stopRef = useRef<() => void>(() => {});
  const done = useRef(false);

  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    if (listening) {
      stopRef.current();
      setListening(false);
      return;
    }
    setHeard("");
    setListening(true);
    let text = "";
    stopRef.current = await listen(
      d.tts,
      w.b,
      (t) => {
        text = t;
        setHeard(t);
        if (!done.current && checkSpoken(t, w)) {
          done.current = true;
          stopRef.current();
          setListening(false);
          respond(true);
        }
      },
      (err) => {
        setListening(false);
        if (done.current) return;
        if (err === "unavailable" || err === "not-allowed" || err === "service-not-allowed" || err === "language-not-supported") {
          setMode("tap");
        } else if (text.trim()) {
          done.current = true;
          respond(false, `I heard “${text.trim()}.”`);
        }
      },
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <Kind p={p}>Say it out loud</Kind>
      <WordRow p={p} w={w} tts={d.tts} />
      <Text style={{ color: p.muted, fontSize: 16 }}>{w.e}</Text>
      {mode === "mic" ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listening ? "Stop listening" : "Tap, then say it"}
            disabled={answered}
            onPress={start}
            style={[st.mic, { backgroundColor: listening ? p.accent : p.surface2, borderColor: listening ? p.accent : p.line }]}
          >
            <Text style={{ color: listening ? p.accentInk : p.fg, fontWeight: "600", textAlign: "center" }}>
              {listening ? "Listening" : "Tap, then say it"}
            </Text>
          </Pressable>
          <Text style={{ color: p.muted, fontStyle: "italic", textAlign: "center", minHeight: 22 }}>{heard}</Text>
        </>
      ) : (
        <>
          <Text style={{ color: p.muted, fontSize: 14 }}>Say it clearly three times. Tap Hear it first if you’re not sure how it sounds.</Text>
          <Btn
            p={p}
            kind="primary"
            label={`I said it (${taps} of 3)`}
            disabled={answered}
            onPress={() => {
              const n = taps + 1;
              setTaps(n);
              if (n >= 3) respond(true);
            }}
          />
        </>
      )}
    </View>
  );
}

function PhotoTask({ p, lang, w, answered, respond, swapType }: TaskProps) {
  const d = DECKS[lang];
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [english, setEnglish] = useState(false);

  const take = async () => {
    if (!cam.current || !ready || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.7, shutterSound: false });
      const small = await shrink(pic.uri);
      setShot(small.uri);
      if (!PHOTO_CHECK_URL) {
        setConfirm(true);
        return;
      }
      setStatus("Checking your photo…");
      const v = await checkPhoto(small.base64, w.w, w.e, d.name);
      if ("error" in v) {
        // The check couldn't run: don't hold the alarm hostage over a network problem.
        setStatus("");
        setConfirm(true);
        return;
      }
      if (v.ok) respond(true, v.reason ? `Spotted: ${v.reason}` : undefined);
      else {
        setStatus(`${v.reason ? "That looks like " + v.reason.replace(/\.$/, "") + ". " : "That doesn't look like it. "}Find ${w.w} and try again.`);
        setShot(null);
      }
    } catch {
      setStatus("The camera didn't take that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Kind p={p}>Photo hunt</Kind>
      <Text style={{ color: p.muted, fontSize: 16 }}>Find this and take a photo of it</Text>
      <WordRow p={p} w={w} tts={d.tts} />
      {english ? <Text style={{ color: p.muted }}>{w.e}</Text> : <Btn p={p} kind="link" label="Show the English" onPress={() => setEnglish(true)} />}

      {shot ? (
        <Image source={{ uri: shot }} style={st.photo} accessibilityLabel="Your photo" />
      ) : perm?.granted ? (
        <View style={st.camWrap}>
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
        </View>
      ) : (
        <Btn p={p} kind="primary" label="Allow the camera" onPress={() => requestPerm()} />
      )}

      {!!status && <Text style={{ color: p.muted, fontSize: 14 }}>{status}</Text>}

      {confirm && !answered ? (
        <>
          <Text style={{ color: p.fg, fontSize: 16 }}>Is that {w.w}?</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn p={p} kind="primary" label="Yes, it is" style={{ flex: 1 }} onPress={() => respond(true)} />
            <Btn p={p} label="Retake" style={{ flex: 1 }} onPress={() => { setConfirm(false); setShot(null); }} />
          </View>
        </>
      ) : (
        !answered && perm?.granted && !shot && (
          <Btn p={p} kind="primary" label={busy ? "Checking…" : "Take the photo"} disabled={!ready || busy} onPress={take} />
        )
      )}
      {!answered && !busy && <Btn p={p} kind="link" label="Can't get to it? Swap for a typing task" onPress={() => swapType("type")} />}
    </View>
  );
}

function Feedback({ p, w, answer, tts, last, onNext }: { p: Palette; w: Word; answer: Answer; tts: string; last: boolean; onNext: () => void }) {
  const [a, b] = w.s.split("___");
  const ok = answer.ok;
  return (
    <View style={{ gap: 12 }}>
      <View style={[st.feedback, { backgroundColor: ok ? p.goodSoft : p.badSoft }]} accessibilityLiveRegion="polite">
        <Text style={{ color: ok ? p.good : p.bad, fontWeight: "700", fontSize: 16 }}>
          {ok ? `Right: ${w.w}` : `${answer.timeUp ? "Time's up. " : ""}It's ${w.w} (${w.e}).`}
        </Text>
        {!!answer.note && <Text style={{ color: ok ? p.good : p.bad }}>{answer.note}</Text>}
        <Text style={{ color: p.fg }}>
          {a}
          <Text style={{ fontWeight: "700" }}>{w.b}</Text>
          {b}
        </Text>
        {!ok && answer.added && <Text style={{ color: p.bad, fontSize: 14 }}>One more task added. You’ll see this word again in a moment.</Text>}
        <Btn p={p} label="Hear the sentence" onPress={() => speak(a + w.b + b, tts)} style={st.hear} />
      </View>
      <Btn p={p} kind="primary" label={last ? "Finish" : "Next"} onPress={onNext} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 20, paddingBottom: 48, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  dots: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  timer: { height: 6, borderRadius: 3, overflow: "hidden" },
  target: { fontSize: 36, fontWeight: "800", flexShrink: 1 },
  sentence: { fontSize: 22, fontWeight: "500", lineHeight: 31 },
  wordRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  hear: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  opt: { flexBasis: "47%", flexGrow: 1, minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: "center", justifyContent: "center" },
  optText: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  input: { fontSize: 20, minHeight: 56, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  mic: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, alignSelf: "center", alignItems: "center", justifyContent: "center", padding: 10 },
  camWrap: { width: "100%", aspectRatio: 3 / 4, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  photo: { width: "100%", aspectRatio: 3 / 4, borderRadius: 12 },
  feedback: { borderRadius: 12, padding: 14, gap: 8 },
  newword: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  newwordText: { fontSize: 22, fontWeight: "700" },
  hint: { textAlign: "center", fontSize: 14 },
});
