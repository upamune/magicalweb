# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6", "soundfile==0.13.1"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""Build the episode audio from per-speaker recordings (mready output), the way it is done in Logic Pro.

  mix       gate each track's silence, mix, then strip the silence of the mix (-28 dB / 1.2 s / 0.2 s pad)
  master    cut the pre-roll, put the OP in front, normalize to -17 LUFS and write the mp3
  speakers  set each transcribed word's speaker to the track that is loudest under it

The work directory keeps tracks.json (names, silence cuts, trim) so `speakers` maps
the final timeline back to the separate tracks.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

SILENCE_DB, SILENCE_MIN, SILENCE_PAD = -28, 1.2, 0.2
FADE_SEC = 0.005
OP_VOICE_START = 8.0
# 声が入る前の OP だけを下げる。+8dB のままだと本編の会話より約6dB大きかった（#305 実測: OP冒頭 -12.3 LUFS、会話 約-18 LUFS）
OP_INTRO_DB = -6
VOICE_DELAY = 7.8
OP_ENV = Path(__file__).resolve().parents[2] / "make-live-action-video/scripts/op_env.py"


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        raise SystemExit(result.stderr[-2000:])
    return result.stderr


def silences(path):
    log = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"silencedetect=n={SILENCE_DB}dB:d={SILENCE_MIN}", "-f", "null", "-")
    spans, start = [], None
    for line in log.splitlines():
        if m := re.search(r"silence_start: (-?[\d.]+)", line):
            start = max(0.0, float(m[1]))
        if (m := re.search(r"silence_end: ([\d.]+)", line)) and start is not None:
            spans.append((start, float(m[1])))
            start = None
    if start is not None:
        spans.append((start, float("inf")))
    return [(a + SILENCE_PAD, b - SILENCE_PAD) for a, b in spans if b - a - 2 * SILENCE_PAD > 0.05]


def fade_edges(x, rate):
    n = min(int(FADE_SEC * rate), len(x) // 2)
    if n:
        ramp = np.linspace(0, 1, n, dtype=x.dtype)
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


def kept_spans(cuts, length, rate):
    spans, pos = [], 0
    for a, b in cuts:
        a, b = int(a * rate), min(int(b * rate), length)
        if a > pos:
            spans.append((pos, a))
        pos = max(pos, b)
    if pos < length:
        spans.append((pos, length))
    return spans


def mute(x, cuts, rate):
    """Silence the cut spans (Logic's per-track strip silence), with short fades instead of zero crossings."""
    out = np.zeros_like(x)
    for a, b in kept_spans(cuts, len(x), rate):
        out[a:b] = fade_edges(x[a:b].copy(), rate)
    return out


def strip(x, cuts, rate):
    """Remove the cut spans and join the rest."""
    return np.concatenate([fade_edges(x[a:b].copy(), rate) for a, b in kept_spans(cuts, len(x), rate)])


def read_mono(path):
    x, rate = sf.read(path, dtype="float32", always_2d=True)
    return x.mean(axis=1), rate


def loudness(path):
    log = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-")
    integrated = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1])
    peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])
    return integrated, peak


def cmd_mix(args):
    src, work = Path(args.src), Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    names = sorted(p.name.removesuffix("_normalized.wav") for p in src.glob("*_normalized.wav"))
    if len(names) < 2:
        raise SystemExit(f"no *_normalized.wav tracks in {src}")
    mixed, rate = None, None
    for name in names:
        x, rate = read_mono(src / f"{name}_normalized.wav")
        cuts = silences(src / f"{name}_normalized.wav")
        gated = mute(x, cuts, rate)
        sf.write(work / f"gated_{name}.wav", gated, rate, subtype="FLOAT")
        mixed = gated if mixed is None else mixed[: len(gated)] + gated[: len(mixed)]
        print(f"{name}: gated {len(cuts)} silences")
    sf.write(work / "mix.wav", mixed, rate, subtype="FLOAT")
    cuts = silences(work / "mix.wav")
    voice = strip(mixed, cuts, rate)
    sf.write(work / "voice.wav", voice, rate, subtype="FLOAT")
    run("ffmpeg", "-y", "-v", "error", "-t", "60", "-i", str(work / "voice.wav"), "-c:a", "libmp3lame", "-b:a", "128k", str(work / "head.mp3"))
    (work / "tracks.json").write_text(json.dumps({"src": str(src), "names": names, "rate": rate, "cuts": cuts}, indent=1))
    print(f"mix: stripped {len(cuts)} silences, {len(mixed) / rate:.1f}s -> {len(voice) / rate:.1f}s")
    print(f"next: transcribe {work / 'head.mp3'} to find where the opening line starts, then `master --trim`")


def cmd_master(args):
    work = Path(args.work)
    state = json.loads((work / "tracks.json").read_text())
    state["trim"] = args.trim
    (work / "tracks.json").write_text(json.dumps(state, indent=1))
    op = work / "op_env.wav"
    op.unlink(missing_ok=True)
    run("uv", "run", str(OP_ENV), str(op), str(OP_VOICE_START), "--intro-db", str(OP_INTRO_DB))
    delay = int(VOICE_DELAY * 1000)
    run("ffmpeg", "-y", "-v", "error", "-ss", str(args.trim), "-i", str(work / "voice.wav"), "-af", f"aresample=48000,adelay={delay}|{delay}", "-c:a", "pcm_f32le", str(work / "voice_trim.wav"))
    raw = work / "master_raw.wav"
    run("ffmpeg", "-y", "-v", "error", "-i", str(work / "voice_trim.wav"), "-i", str(op), "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0:duration=longest[m]", "-map", "[m]", "-c:a", "pcm_f32le", str(raw))

    # リミッターで上がりきらないぶんを、書き出した mp3 を測り直して詰める
    integrated = loudness(raw)[0]
    gain = 0.0
    for _ in range(5):
        gain += args.target - integrated
        run("ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.7:level=disabled:attack=5:release=50", "-c:a", "pcm_s16le", str(work / "master.wav"))
        run("ffmpeg", "-y", "-v", "error", "-i", str(work / "master.wav"), "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", args.out)
        integrated, peak = loudness(args.out)
        if abs(integrated - args.target) <= 0.15:
            break
    duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", args.out], capture_output=True, text=True, check=True).stdout)
    print(f"master: {args.out} {duration:.1f}s, gain {gain:.2f} dB, {integrated} LUFS, peak {peak} dBFS")


def cmd_speakers(args):
    work = Path(args.work)
    state = json.loads((work / "tracks.json").read_text())
    if "trim" not in state:
        raise SystemExit("run `master` first (the trim is needed to map the timeline)")
    rate = state["rate"]
    stripped = {n: strip(read_mono(work / f"gated_{n}.wav")[0], state["cuts"], rate) for n in state["names"]}
    offset = state["trim"] - VOICE_DELAY

    def level(name, start, end):
        a, b = int(max(0.0, start + offset) * rate), int(max(0.0, end + offset) * rate)
        x = stripped[name][a:b]
        return float(np.log10(np.sqrt(np.mean(x ** 2)) + 1e-6)) if len(x) else -6.0

    raw = json.loads(Path(args.raw).read_text())
    words = [w for w in raw["words"] if w.get("type") == "word"]
    levels = np.array([[level(n, w["start"] - 0.05, w["end"] + 0.05) for n in state["names"]] for w in words])
    # 1文字単位の判定は揺れるので、句読点か 0.25 秒以上の間で区切った句ごとに平均する
    start = 0
    for i, w in enumerate(words):
        if i == len(words) - 1 or re.search(r"[。、？！?!]$", w["text"]) or words[i + 1]["start"] - w["end"] > 0.25:
            levels[start : i + 1] = levels[start : i + 1].mean(axis=0)
            start = i + 1
    for i, w in enumerate(words):
        if i and re.fullmatch(r"[。、？！?!]+", w["text"]):
            w["speaker_id"] = words[i - 1]["speaker_id"]
        else:
            w["speaker_id"] = state["names"][int(levels[i].argmax())]
    last = state["names"][0]
    for w in raw["words"]:
        if w.get("type") == "word":
            last = w["speaker_id"]
        else:
            w["speaker_id"] = last
    Path(args.out).write_text(json.dumps(raw, ensure_ascii=False))
    counts = {n: sum(w["speaker_id"] == n for w in words) for n in state["names"]}
    print(f"speakers: {counts} -> {args.out}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(required=True)
    p = sub.add_parser("mix", help="gate, mix and strip silence")
    p.add_argument("src", help="mready output folder with <name>_normalized.wav per speaker")
    p.add_argument("work")
    p.set_defaults(func=cmd_mix)
    p = sub.add_parser("master", help="cut the pre-roll, add the OP, normalize and write the mp3")
    p.add_argument("work")
    p.add_argument("out", help="e.g. video/transcripts/ep-N.mp3")
    p.add_argument("--trim", type=float, required=True, help="seconds to cut from the head of voice.wav (just before the opening line)")
    p.add_argument("--target", type=float, default=-17.0, help="integrated loudness of the mp3 in LUFS")
    p.set_defaults(func=cmd_master)
    p = sub.add_parser("speakers", help="assign speakers from the separate tracks")
    p.add_argument("work")
    p.add_argument("raw", help="ElevenLabs raw JSON of the mastered mp3")
    p.add_argument("out")
    p.set_defaults(func=cmd_speakers)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
