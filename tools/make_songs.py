# Renders Wake Word's alarm songs: instrumental arrangements of public-domain tunes.
# Usage: python3 make_songs.py OUT_DIR   (needs numpy and ffmpeg)
import os, subprocess, sys
import numpy as np

SR = 44100
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def freq(n):
    if n is None:
        return None
    name, rest = n[0], n[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    midi = 12 * (int(rest) + 1) + NAMES[name] + acc
    return 440.0 * 2 ** ((midi - 69) / 12)


def pluck(f, dur, bright=0.5, decay=0.996):
    """Karplus-Strong plucked string."""
    n = int(dur * SR)
    period = max(2, int(round(SR / f - 0.5)))  # the averaging filter adds half a sample
    rng = np.random.default_rng(int(f * 1000) % 2**32)
    buf = rng.uniform(-1, 1, period)
    # soften the excitation for a warmer tone
    for _ in range(int((1 - bright) * 4)):
        buf = 0.5 * (buf + np.roll(buf, 1))
    out = np.empty(n)
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % period
        buf[idx] = decay * 0.5 * (buf[idx] + buf[nxt])
        idx = nxt
    env = np.minimum(1, np.linspace(0, dur, n) * 400)
    tail = int(0.03 * SR)
    if n > tail:
        env[-tail:] *= np.linspace(1, 0, tail)
    return out * env


def reed(f, dur, detune_cents=7, vib=5.2):
    """Accordion-like: two slightly detuned reeds (musette), soft attack, light vibrato."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for c in (0, detune_cents):
        ff = f * 2 ** (c / 1200) * (1 + 0.003 * np.sin(2 * np.pi * vib * t))
        ph = 2 * np.pi * np.cumsum(ff) / SR
        for h, a in ((1, 1.0), (2, 0.55), (3, 0.35), (4, 0.22), (5, 0.12), (6, 0.08)):
            out += a * np.sin(h * ph)
    a = int(0.025 * SR)
    r = int(0.06 * SR)
    env = np.ones(n)
    env[:a] = np.linspace(0, 1, a)
    if n > r:
        env[-r:] *= np.linspace(1, 0, r)
    return out * env / 4


def mandolin(f, dur):
    """Mandolin: plucked, with tremolo on longer notes."""
    if dur < 0.45:
        return pluck(f, dur, bright=0.8, decay=0.994)
    n = int(dur * SR)
    out = np.zeros(n)
    step = 1 / 13.0
    t = 0.0
    k = 0
    while t < dur - 0.02:
        seg = pluck(f, min(step * 2.2, dur - t), bright=0.8, decay=0.994) * (1.0 if k == 0 else 0.6)
        i = int(t * SR)
        out[i:i + len(seg)] += seg[: n - i]
        t += step
        k += 1
    return out * 0.8


def guitar(f, dur):
    return pluck(f, max(dur, 0.6), bright=0.35, decay=0.997)


def render(events, total, inst, gain=1.0):
    """events: (start_sec, note, dur_sec)."""
    out = np.zeros(int((total + 2) * SR))
    for start, note, dur in events:
        f = freq(note)
        if f is None:
            continue
        sig = inst(f, dur) * gain
        i = int(start * SR)
        out[i:i + len(sig)] += sig[: len(out) - i]
    return out


def seq(notes, bpm, start=0.0):
    """notes: [(note|None, beats)] -> events and end time."""
    spb = 60.0 / bpm
    t = start
    ev = []
    for n, b in notes:
        if n is not None:
            ev.append((t, n, b * spb * 0.98))
        t += b * spb
    return ev, t


def reverb(x, mix=0.18):
    out = x.copy()
    for d, g in ((0.029, 0.5), (0.037, 0.45), (0.053, 0.35), (0.071, 0.3), (0.097, 0.22), (0.131, 0.15)):
        k = int(d * SR)
        out[k:] += g * mix * x[:-k]
    return out


def finish(x, name):
    x = reverb(x)
    peak = np.max(np.abs(x)) or 1
    x = np.tanh(1.3 * x / peak) / np.tanh(1.3)
    x = x * 0.92
    fade = int(0.05 * SR)
    x[:fade] *= np.linspace(0, 1, fade)
    nz = np.nonzero(np.abs(x) > 1e-3)[0]
    x = x[: nz[-1] + int(0.3 * SR)] if len(nz) else x
    x[-fade:] *= np.linspace(1, 0, fade)
    pcm = (x * 32767).astype("<i2").tobytes()
    path = os.path.join(OUT, name + ".mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "-codec:a", "libmp3lame", "-b:a", "96k", path],
        input=pcm, check=True,
    )
    print(name, round(len(x) / SR, 1), "s", os.path.getsize(path) // 1024, "KB")


def P(s):
    """'E4:.5 A4:1 -:1' -> [(note, beats)]"""
    out = []
    for tok in s.split():
        n, b = tok.split(":")
        out.append((None if n == "-" else n, float(b)))
    return out


def twice(notes):
    return notes + notes


# ---------- Italian (mandolin) ----------
bella = P(
    "E4:.5 A4:.5 B4:.5 C5:.5 A4:2 "
    "E4:.5 A4:.5 B4:.5 C5:.5 A4:2 "
    "E4:.5 A4:.5 B4:.5 C5:1 B4:.5 A4:.5 C5:1 B4:.5 A4:.5 E5:1 E5:.5 E5:.5 E5:1 "
    "D5:.5 E5:.5 F5:1 F5:1 F5:.5 E5:.5 D5:.5 F5:.5 E5:2 "
    "E5:.5 D5:.5 C5:1 B4:1 E5:1 C5:.5 B4:.5 A4:2 -:1"
)
donna = P(
    "C5:.5 C5:.5 C5:.5 E5:.75 D5:.25 Bb4:1 -:.5 "
    "Bb4:.5 Bb4:.5 Bb4:.5 D5:.75 C5:.25 A4:1 -:.5 "
    "G4:.5 C5:.5 Bb4:.5 A4:.5 G4:.5 Bb4:.5 A4:.5 G4:.5 F4:1.5 -:.5"
)
tell = P(
    "G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 C5:.5 D5:.5 E5:.5 "
    "G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 C5:.25 E5:.25 D5:.5 B4:.5 G4:.5 "
    "G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 G4:.5 G4:.25 G4:.25 C5:.5 D5:.5 E5:.5 "
    "C5:.25 E5:.25 G5:.5 E5:.5 D5:.5 C5:1 -:.5"
)
for name, notes, bpm in (("it-bella-ciao", bella, 128), ("it-la-donna-e-mobile", donna, 120), ("it-william-tell", tell, 138)):
    ev, end = seq(twice(notes), bpm)
    finish(render(ev, end, mandolin), name)

# ---------- French (accordion) ----------
jacques = P(
    "C4:1 D4:1 E4:1 C4:1 C4:1 D4:1 E4:1 C4:1 "
    "E4:1 F4:1 G4:2 E4:1 F4:1 G4:2 "
    "G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 G4:.5 A4:.5 G4:.5 F4:.5 E4:1 C4:1 "
    "C4:1 G3:1 C4:2 C4:1 G3:1 C4:2"
)
lune = P(
    "C5:1 C5:1 C5:1 D5:1 E5:2 D5:2 C5:1 E5:1 D5:1 D5:1 C5:4 "
    "C5:1 C5:1 C5:1 D5:1 E5:2 D5:2 C5:1 E5:1 D5:1 D5:1 C5:4 "
    "D5:1 D5:1 D5:1 D5:1 A4:2 A4:2 D5:1 C5:1 B4:1 A4:1 G4:4 "
    "C5:1 C5:1 C5:1 D5:1 E5:2 D5:2 C5:1 E5:1 D5:1 D5:1 C5:4"
)
alouette = P(
    "G4:.5 A4:.5 B4:1 B4:1 A4:.5 G4:.5 A4:.5 B4:.5 G4:1 D4:1 "
    "G4:.5 A4:.5 B4:1 B4:1 A4:.5 G4:.5 A4:.5 B4:.5 G4:2"
)
for name, notes, bpm, key in (("fr-frere-jacques", jacques, 112, ("C3", "G3")), ("fr-au-clair-de-la-lune", lune, 108, ("C3", "G3")), ("fr-alouette", alouette, 120, ("G2", "D3"))):
    ev, end = seq(twice(notes), bpm)
    mel = render(ev, end, reed)
    if name == "fr-frere-jacques":  # it's a round: a second voice comes in two bars later
        ev2, _ = seq(notes, bpm, start=8 * 60 / bpm)
        mel += 0.55 * render(ev2, end, lambda f, d: reed(f * 2, d))
    # soft bellows drone on the tonic and fifth
    spb = 60 / bpm
    drone = []
    t = 0
    while t < end:
        drone += [(t, key[0], 2 * spb * 0.95), (t + 2 * spb, key[1], 2 * spb * 0.95)]
        t += 4 * spb
    mel += 0.35 * render(drone, end, reed)
    finish(mel, name)

# ---------- Spanish (guitar) ----------
cuca = P(
    "G3:.5 G3:.5 G3:.5 C4:1.5 E4:1 G3:.5 G3:.5 G3:.5 C4:1.5 E4:1 "
    "C4:1 C4:.5 B3:.5 B3:.5 A3:.5 A3:.5 G3:2.5 "
    "G3:.5 G3:.5 G3:.5 B3:1.5 D4:1 G3:.5 G3:.5 G3:.5 B3:1.5 D4:1 "
    "G4:.5 G4:.5 F4:.5 F4:.5 E4:.5 E4:.5 D4:.5 D4:.5 C4:2"
)
ev, end = seq(twice(cuca), 150)
spb = 60 / 150
strum = []
t = 0
while t < end:  # light offbeat strum
    strum += [(t + spb, "C3", 0.3), (t + spb * 1.02, "E3", 0.3), (t + spb * 1.04, "G3", 0.3)]
    t += 2 * spb
finish(render(ev, end, guitar) + 0.4 * render(strum, end, guitar), "es-la-cucaracha")

# Romance (anonymous, 19th c.): melody on the first of each triplet, chord tones after.
bars = [
    ("B4 B4 B4", "Em"), ("B4 A4 G4", "Em"), ("G4 F#4 E4", "Em"), ("E4 G4 B4", "Em"),
    ("E5 E5 E5", "Em"), ("E5 D5 C5", "Am"), ("C5 B4 A4", "Am"), ("A4 B4 C5", "Am"),
    ("B4 C5 B4", "B7"), ("A4 G4 F#4", "B7"), ("G4 F#4 E4", "Em"), ("E4 E4 E4", "Em"),
]
chords = {"Em": ("B3", "G3", "E2"), "Am": ("C4", "A3", "A2"), "B7": ("A3", "F#3", "B2")}
bpm = 72
spb = 60 / bpm
ev = []
t = 0
for _ in range(2):
    for mel, ch in bars:
        inner1, inner2, bass = chords[ch]
        ev.append((t, bass, 3 * spb))
        for m in mel.split():
            ev += [(t, m, spb), (t + spb / 3, inner1, spb), (t + 2 * spb / 3, inner2, spb)]
            t += spb
finish(render(ev, t, guitar), "es-romance")

# Habanera: chromatic melody over the habanera bass rhythm.
hab = P(
    "D5:.75 C#5:.25 C5:.5 C5:.5 B4:.75 Bb4:.25 A4:.5 A4:.5 "
    "Ab4:.75 G4:.25 F4:.5 E4:.5 F4:.5 E4:.5 D4:1 "
    "D5:.75 C#5:.25 C5:.5 C5:.5 B4:.75 Bb4:.25 A4:.5 A4:.5 "
    "Ab4:.75 G4:.25 F4:.5 E4:.5 D4:2"
)
bpm = 96
ev, end = seq(twice(hab), bpm)
spb = 60 / bpm
bass = []
t = 0
k = 0
while t < end:  # dotted-eighth, sixteenth, eighth, eighth
    root = "D3" if (k // 2) % 2 == 0 else "A2"
    bass += [(t, root, 0.7 * spb), (t + 0.75 * spb, "A2" if root == "D3" else "E3", 0.25 * spb),
             (t + spb, "F3" if root == "D3" else "C#3", 0.45 * spb), (t + 1.5 * spb, "A3" if root == "D3" else "G3", 0.45 * spb)]
    t += 2 * spb
    k += 1
finish(render(ev, end, guitar) + 0.55 * render(bass, end, guitar), "es-habanera")
