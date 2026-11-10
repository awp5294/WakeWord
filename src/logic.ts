// Learning logic: spaced repetition (Leitner boxes), mission building and answer checking.
// Pure functions with no React Native imports, so they run under plain Node for the tests.
import { DECKS, Lang, Word } from "./decks";

export const INTERVALS = [0, 1, 2, 4, 7, 14, 30]; // days until the next review, by box
export const MAX_BOX = 6;
const ARTICLES = ["il", "lo", "la", "l", "i", "gli", "le", "un", "una", "uno", "el", "los", "las", "les", "une", "du", "der", "die", "das", "ein", "eine", "se"];

export type TaskType = "pick" | "listen" | "fillpick" | "filltype" | "type" | "say" | "photo";
export type Level = "beginner" | "intermediate";
export type WordState = { box: number; due: string; right: number; wrong: number; introduced: string; seen?: boolean; last?: string };
export type LangProgress = { words: Record<string, WordState>; introDay: string | null; introCount: number };
export type Settings = { lang: Lang; level: Level; alarm: string; count: number; photos: boolean; newPerDay: number; enabled: boolean; voices: Partial<Record<Lang, string>>;
  // Alarm sound: "phone" (the phone's alarm sound), a song id, or "custom" (your own file).
  sound: string; soundUri?: string; soundName?: string };
export type MissionSummary = { lang: Lang; tasks: number; right: number; wrong: number; secs: number; alarm: boolean };
export type State = {
  v: number;
  updatedAt: number;
  settings: Settings;
  progress: Partial<Record<Lang, LangProgress>>;
  streak: { count: number; last: string | null; best: number };
  missions: (MissionSummary & { day: string })[];
};
export type QueueItem = { i: number; type: TaskType; retry?: boolean };
export type Mission = { newWords: number[]; queue: QueueItem[]; extra?: number };
export type Rand = () => number;

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}

export function norm(s: string, keepAccents = false): string {
  let x = String(s || "").toLowerCase().replace(/[’`]/g, "'");
  if (!keepAccents) x = x.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return x.replace(/[¡¿!?.,;:"]/g, " ").replace(/\s+/g, " ").trim();
}
export function stripArticle(x: string): string {
  let parts = x.split(" ");
  if (/^(l|d)'/.test(parts[0])) parts[0] = parts[0].slice(2); // "l'acqua", "l'eau", "d'eau"
  while (parts.length > 1 && ARTICLES.includes(parts[0])) parts = parts.slice(1);
  return parts.join(" ");
}
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

export type TypedResult = "exact" | "accent" | "typo" | "wrong";
// "accent": right but accents missing. "typo": one letter off on a longer word.
export function checkTyped(input: string, word: Word): TypedResult {
  const target = [stripArticle(norm(word.b, true)), stripArticle(norm(word.w, true))];
  const got = stripArticle(norm(input, true));
  if (!got) return "wrong";
  if (target.includes(got)) return "exact";
  const tPlain = target.map((t) => norm(t));
  const gPlain = norm(got);
  if (tPlain.includes(gPlain)) return "accent";
  if (tPlain[0].length >= 5 && lev(gPlain, tPlain[0]) === 1) return "typo";
  return "wrong";
}
// Spoken text matches if the bare form appears in it (accents ignored).
export function checkSpoken(text: string, word: Word): boolean {
  const got = " " + norm(text) + " ";
  const want = norm(stripArticle(norm(word.b, true)));
  return got.includes(" " + want + " ") || got.replace(/ /g, "").includes(want.replace(/ /g, ""));
}

export function freshState(): State {
  return {
    v: 1,
    updatedAt: 0,
    settings: { lang: "it", level: "beginner", alarm: "06:30", count: 3, photos: true, newPerDay: 2, enabled: false, voices: {}, sound: "phone" },
    progress: {},
    streak: { count: 0, last: null, best: 0 },
    missions: [],
  };
}
// Fill in anything an older saved state is missing.
export function upgradeState(raw: unknown): State {
  const base = freshState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<State>;
  return {
    ...base,
    ...s,
    settings: { ...base.settings, ...(s.settings || {}) },
    streak: { ...base.streak, ...(s.streak || {}) },
    progress: s.progress || {},
    missions: s.missions || [],
  };
}
export function langProgress(state: State, lang: Lang): LangProgress {
  if (!state.progress[lang]) state.progress[lang] = { words: {}, introDay: null, introCount: 0 };
  return state.progress[lang]!;
}

// Introduce new words up to the daily allowance (force: ignore it). Returns the indexes added now.
export function introduceNew(state: State, lang: Lang, today: string, wantAtLeast: number, force = false): number[] {
  const lp = langProgress(state, lang);
  const deck = DECKS[lang].words;
  if (lp.introDay !== today) {
    lp.introDay = today;
    lp.introCount = 0;
  }
  const allowance = Math.max(0, state.settings.newPerDay - lp.introCount);
  const need = wantAtLeast || 0;
  const quota = force ? need : Math.min(allowance, need);
  const added: number[] = [];
  for (let i = 0; i < deck.length && added.length < quota; i++) {
    if (!lp.words[i]) {
      lp.words[i] = { box: 0, due: today, right: 0, wrong: 0, introduced: today };
      added.push(i);
      lp.introCount++;
    }
  }
  return added;
}

export function dueWords(state: State, lang: Lang, today: string): number[] {
  const lp = langProgress(state, lang);
  return Object.entries(lp.words)
    .filter(([, s]) => s.due <= today)
    .sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].box - b[1].box)
    .map(([i]) => Number(i));
}

// Pick the task kind from the word's box: easy kinds first, harder ones as it sticks.
export function pickType(
  word: Word,
  box: number,
  opts: { photos?: boolean; tts?: boolean; say?: boolean; level?: Level; last?: TaskType | null; rand?: Rand } = {},
): TaskType {
  const o = { photos: true, tts: true, say: true, level: "beginner" as Level, last: null as TaskType | null, rand: Math.random, ...opts };
  const b = box + (o.level === "intermediate" ? 1 : 0);
  const photo: TaskType[] = o.photos && word.p ? ["photo"] : [];
  const listen: TaskType[] = o.tts ? ["listen"] : [];
  const say: TaskType[] = o.say ? ["say"] : [];
  let pool: TaskType[];
  if (b <= 0) pool = ["pick", ...listen];
  else if (b === 1) pool = ["pick", "fillpick", ...listen, ...photo];
  else if (b === 2) pool = ["fillpick", ...say, ...photo, ...photo];
  else pool = ["type", "filltype", ...say, ...photo];
  const choices = pool.filter((t) => t !== o.last);
  const list = choices.length ? choices : pool;
  return list[Math.floor(o.rand() * list.length)];
}

// Build a mission. Reviews come first; new words fill in only when reviews can't.
export function buildMission(state: State, lang: Lang, today: string, opts: { rand?: Rand; tts?: boolean; say?: boolean } = {}): Mission {
  const o = { rand: Math.random, tts: true, say: true, ...opts };
  const count = state.settings.count;
  const lp = langProgress(state, lang);
  let due = dueWords(state, lang, today);
  const added: number[] = [];
  if (due.length < count) {
    added.push(...introduceNew(state, lang, today, count - due.length));
    due = dueWords(state, lang, today);
  }
  let picked = due.slice(0, count);
  if (picked.length < count) {
    const rest = Object.entries(lp.words)
      .map(([i, s]) => [Number(i), s] as const)
      .filter(([i]) => !picked.includes(i))
      .sort((a, b) => a[1].box - b[1].box)
      .map(([i]) => i);
    picked = picked.concat(rest.slice(0, count - picked.length));
  }
  if (picked.length < count) {
    // First days: not enough words yet, so go past the daily allowance.
    const more = introduceNew(state, lang, today, count - picked.length, true);
    added.push(...more);
    picked.push(...more);
  }
  for (let k = picked.length - 1; k > 0; k--) {
    const j = Math.floor(o.rand() * (k + 1));
    [picked[k], picked[j]] = [picked[j], picked[k]];
  }
  const deck = DECKS[lang].words;
  const queue: QueueItem[] = [];
  let last: TaskType | null = null;
  for (const i of picked) {
    const type = pickType(deck[i], lp.words[i].box, {
      photos: state.settings.photos, tts: o.tts, say: o.say, level: state.settings.level, last, rand: o.rand,
    });
    queue.push({ i, type });
    last = type;
  }
  if (state.settings.photos && !queue.some((q) => q.type === "photo")) {
    const cand = queue.find((q) => deck[q.i].p && lp.words[q.i].box >= 1);
    if (cand) cand.type = "photo";
  }
  const newWords = added.filter((i) => {
    const w = lp.words[i];
    return w && w.introduced === today && w.box === 0 && !w.seen;
  });
  return { newWords, queue };
}

// Grade the first try at a word in a mission and move it through the boxes.
export function grade(state: State, lang: Lang, i: number, correct: boolean, today: string): void {
  const s = langProgress(state, lang).words[i];
  if (!s) return;
  s.seen = true;
  // A second right answer the same day doesn't push the word further out: spacing needs the gap.
  if (correct && s.last === today && s.box > 0) {
    s.right++;
    return;
  }
  if (correct) {
    s.box = Math.min(MAX_BOX, s.box + 1);
    s.right++;
  } else {
    s.box = 1;
    s.wrong++;
  }
  s.due = addDays(today, correct ? INTERVALS[s.box] : 1);
  s.last = today;
}

// A miss brings the word back two tasks later in an easier form (at most 3 extra tasks).
export function onMiss(mission: Mission, pos: number): boolean {
  mission.extra = mission.extra || 0;
  if (mission.extra >= 3) return false;
  mission.extra++;
  const q = mission.queue[pos];
  const easier: TaskType = q.type === "photo" ? "type" : q.type === "type" || q.type === "filltype" ? "fillpick" : "pick";
  const at = Math.min(mission.queue.length, pos + 2);
  mission.queue.splice(at, 0, { i: q.i, type: easier, retry: true });
  return true;
}

// Change a task's kind (a photo hunt you can't get to becomes a typing task).
export function setTaskType(mission: Mission, pos: number, type: TaskType): void {
  const q = mission.queue[pos];
  if (q) q.type = type;
}

export function finishMission(state: State, today: string, summary: MissionSummary): void {
  const st = state.streak;
  if (st.last !== today) {
    st.count = st.last && daysBetween(st.last, today) === 1 ? st.count + 1 : 1;
    st.last = today;
    st.best = Math.max(st.best || 0, st.count);
  }
  state.missions = (state.missions || []).concat([{ day: today, ...summary }]).slice(-60);
}
export function currentStreak(state: State, today: string): number {
  const st = state.streak;
  if (!st.last) return 0;
  return daysBetween(st.last, today) <= 1 ? st.count : 0;
}
export function stats(state: State, lang: Lang, today: string) {
  const ws = Object.values(langProgress(state, lang).words);
  return {
    learning: ws.filter((w) => w.box >= 1 && w.box < 4).length,
    known: ws.filter((w) => w.box >= 4).length,
    started: ws.length,
    dueToday: ws.filter((w) => w.due <= today).length,
    dueTomorrow: ws.filter((w) => w.due <= addDays(today, 1)).length,
    total: DECKS[lang].words.length,
  };
}

// Next time "HH:MM" comes round after now.
export function nextRing(hhmm: string, now: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// Word indexes for a multiple-choice question: the answer plus n-1 others with a different `field`.
export function options(lang: Lang, i: number, field: "e" | "b", n: number, rand: Rand = Math.random): number[] {
  const deck = DECKS[lang].words;
  const others = deck.map((_, k) => k).filter((k) => k !== i && deck[k][field] !== deck[i][field]);
  for (let k = others.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [others[k], others[j]] = [others[j], others[k]];
  }
  const pick = [i, ...others.slice(0, n - 1)];
  for (let k = pick.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [pick[k], pick[j]] = [pick[j], pick[k]];
  }
  return pick;
}

// Seconds allowed per task kind.
export const TASK_SECONDS: Record<TaskType, number> = { pick: 30, listen: 35, fillpick: 40, filltype: 50, type: 50, say: 60, photo: 150 };

export function formatTime(hhmm: string, use24 = false): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (use24) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}
