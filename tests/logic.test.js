const path = require("path"); const built = path.resolve(process.argv[2] || path.join(__dirname, "../.test-build/logic.js")); const L = { ...require(built), ...require(path.join(path.dirname(built), "decks.js")) };
const assert = require('assert');
// deck sanity
for (const [k, d] of Object.entries(L.DECKS)) {
  assert.strictEqual(d.words.length, 32, k);
  d.words.forEach((w, i) => { assert(w.s.includes('___'), k+i); assert(w.s.split('___').length===2, k+i); assert(L.checkTyped(w.b, w)==='exact', k+' '+w.w); assert(L.checkTyped(w.w, w)==='exact', k+' w '+w.w); });
}
const it = L.DECKS.it.words, es = L.DECKS.es.words, fr = L.DECKS.fr.words, de=L.DECKS.de.words;
const f = (lang, b) => L.DECKS[lang].words.find(w=>w.b===b);
assert.strictEqual(L.checkTyped('il forno', f('it','forno')), 'exact');
assert.strictEqual(L.checkTyped('Forno', f('it','forno')), 'exact');
assert.strictEqual(L.checkTyped('caffe', f('it','caffè')), 'accent');
assert.strictEqual(L.checkTyped("l'acqua", f('it','acqua')), 'exact');
assert.strictEqual(L.checkTyped("l’eau", f('fr','eau')), 'exact');
assert.strictEqual(L.checkTyped('frigorifro', f('it','frigorifero')), 'typo');
assert.strictEqual(L.checkTyped('tavolo', f('it','forno')), 'wrong');
assert.strictEqual(L.checkTyped('donde', f('es','dónde')), 'accent');
assert.strictEqual(L.checkTyped('kuhlschrank', f('de','Kühlschrank')), 'accent');
assert.strictEqual(L.checkTyped('se réveiller', f('fr','réveiller')), 'exact');
assert.strictEqual(L.checkTyped('', f('fr','réveiller')), 'wrong');
assert(L.checkSpoken('Il forno', f('it','forno')));
assert(L.checkSpoken('buenos dias', f('es','buenos días')));
assert(!L.checkSpoken('il tavolo', f('it','forno')));
// dates
assert.strictEqual(L.addDays('2026-12-31', 1), '2027-01-01');
assert.strictEqual(L.daysBetween('2026-11-09','2026-11-10'), 1);
// mission flow over 10 days
let seed = 1; const rand = () => (seed = (seed*16807)%2147483647)/2147483647;
const s = L.freshState();
let day = '2026-11-10';
for (let d=0; d<30; d++) {
  const m = L.buildMission(s, 'it', day, {rand});
  assert.strictEqual(m.queue.length, 3, 'queue len day '+d);
  if (d===0) { assert.strictEqual(m.newWords.length, 3); }
  const st=L.stats(s,"it",day); assert(st.dueToday <= 12, "backlog "+st.dueToday);
  const seen = new Set();
  for (let p=0; p<m.queue.length; p++) {
    const q = m.queue[p];
    if (q.retry || seen.has(q.i)) continue; seen.add(q.i);
    const ok = rand() > 0.25;
    L.grade(s, 'it', q.i, ok, day);
    if (!ok) L.onMiss(m, p);
  }
  L.finishMission(s, day, {n: m.queue.length});
  console.log(day, m.queue.map(q=>q.i+':'+q.type+(q.retry?'*':'')).join(' '), JSON.stringify(L.stats(s,'it',day)));
  day = L.addDays(day, 1);
}
assert.strictEqual(L.currentStreak(s, L.addDays(day,-1)), 30);
assert.strictEqual(L.currentStreak(s, L.addDays(day,1)), 0);
// nextRing
const now = new Date(2026,10,10,7,0); assert.strictEqual(L.nextRing('06:30', now).getDate(), 11); assert.strictEqual(L.nextRing('07:30', now).getHours(), 7);
// photos off never yields photo
const s2 = L.freshState(); s2.settings.photos=false; s2.settings.count=5;
for (let d=0; d<5; d++) { const m=L.buildMission(s2,'de',L.addDays('2026-11-10',d),{rand}); assert(!m.queue.some(q=>q.type==='photo')); m.queue.forEach(q=>L.grade(s2,'de',q.i,true,L.addDays('2026-11-10',d))); }
// options
const o = L.options('it', 3, 'e', 4, rand); assert.strictEqual(o.length,4); assert(o.includes(3)); assert.strictEqual(new Set(o.map(k=>it[k].e)).size,4);
console.log('all ok');
