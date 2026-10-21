# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""台本（specs/<id>.json）を素材の切り出し前に検査し、ショートの時刻表を出す。

使い方: uv run check.py specs/<id>.json [--quiet]
✗ は誤りで終了コード1。⚠ は直すかどうかを判断する。同じ直しを繰り返したら、ここに検査を足す。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_short import FPS, PARTS, expand_video, frames, mapper  # noqa: E402

BG = ["lilac", "lime", "sky", "candy"]
LINE_MAX, HOOK_MAX = 11, 10


def tc(f):
    s = f / FPS
    return f"{int(s // 60)}:{s % 60:04.1f}"


def width(s):
    return sum(0.5 if c.isascii() else 1 for c in s)


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    errs, warns = [], []
    for k in ("id", "part", "number", "series", "bg", "hook", "segments", "captions"):
        if k not in spec:
            errs.append(f"{k} がない")
    if errs:
        sys.exit("\n".join(f"✗ {e}" for e in errs))
    if spec["part"] not in PARTS:
        sys.exit(f"✗ part {spec['part']} が parts.json にない")

    segs = spec["segments"]
    for i, (a, b) in enumerate(segs):
        if b <= a:
            errs.append(f"segments[{i}] の終わりが始まり以前: {a}〜{b}")
        if i and a < segs[i - 1][1]:
            errs.append(f"segments[{i}] が前の区間と重なるか逆順: {segs[i - 1]} → {[a, b]}")
    tail = round(spec.get("tail", 2.0) * FPS)
    m, total = mapper(segs)
    if "video" in spec:
        if len(spec["video"]) != len(segs):
            errs.append(f"video は segments と同じ数（{len(segs)}）にする: {len(spec['video'])}")
        else:
            _, vtotal = mapper(expand_video(segs, spec["video"]))
            if vtotal != total:
                errs.append(f"映像 {vtotal} と音声 {total} のフレーム数が違う")
    body = total / FPS
    if not 38 <= body <= 55:
        warns.append(f"本編部分が {body:.1f} 秒（目安40〜50秒）")

    # 区間の端が語の途中に掛かっていないか。Scribe の日本語は1文字ずつで、終わりが次の文字の頭まで伸びるので両側に余裕を見る
    words = [w for w in json.load(open(PARTS[spec["part"]]["transcript"]))["words"] if w["type"] == "word"]
    for i, (a, b) in enumerate(segs):
        for edge, name in ((a, "頭"), (b, "終わり")):
            hit = [w for w in words if w["start"] + 0.08 < edge < w["end"] - 0.08]
            if hit:
                warns.append(f"segments[{i}] の{name} {edge} が語「{hit[0]['text']}」"
                             f"（{hit[0]['start']:.2f}〜{hit[0]['end']:.2f}）の途中")

    hook = spec["hook"]
    if not 1 <= len(hook) <= 2:
        errs.append(f"hook は1〜2行: {len(hook)}行")
    for line in hook:
        if width(line) > HOOK_MAX + 1:
            warns.append(f"hook「{line}」が {width(line):g} 文字（目安{HOOK_MAX}）")
    num = int(spec["number"].lstrip("#"))
    if spec["bg"] != BG[num % 4]:
        warns.append(f"bg は {spec['number']} なら {BG[num % 4]}（今は {spec['bg']}）")

    caps = sorted(spec["captions"], key=lambda c: c["at"])
    starts = [m(c["at"]) for c in caps]
    rows = []
    for i, (c, f) in enumerate(zip(caps, starts)):
        end = starts[i + 1] if i + 1 < len(caps) else total
        text = " / ".join(c["lines"])
        if c.get("s") not in ("m", "u"):
            errs.append(f"{c['at']} の s は m か u: {c.get('s')}")
        if not 1 <= len(c["lines"]) <= 2:
            errs.append(f"{c['at']}「{text}」は1〜2行にする")
        for line in c["lines"]:
            if width(line) > LINE_MAX + (2 if c.get("big") else 0):
                warns.append(f"{c['at']}「{line}」が {width(line):g} 文字（目安{LINE_MAX}）")
        if not any(a - 0.01 <= c["at"] < b for a, b in segs):
            warns.append(f"{c['at']}「{text}」が採用区間の外（次の区間の頭 {tc(f)} に寄る）")
        dur = (end - f) / FPS
        chars = sum(width(x) for x in c["lines"])
        if end <= f:
            warns.append(f"{c['at']}「{text}」は次の字幕と同じフレームで、表示されない")
        elif dur < 0.4 or chars / dur > 12:
            warns.append(f"{c['at']}「{text}」が {dur:.2f} 秒で {chars:g} 文字（読み切れない）")
        rows.append(f"  {tc(f)} {dur:4.1f}s {c.get('s', '?')} {'★' if c.get('big') else ' '} {text}")
    big = sum(1 for c in caps if c.get("big"))
    if not 1 <= big <= 3:
        warns.append(f"big が {big} 回（目安1〜3回）")
    if starts and starts[0] > FPS:
        warns.append(f"最初の字幕が {tc(starts[0])} から（最初の2秒で問いを立てる）")

    for c in spec.get("crops", []):
        if not 540 <= c["cx"] <= 1380:
            warns.append(f"crops {c['at']} の cx {c['cx']} は 540〜1380 に丸められる")

    if "--quiet" not in sys.argv:
        print(f"■ {spec['id']}  {spec['number']} {spec['series']}  「{' '.join(hook)}」")
        print("\n".join(rows))
    for w in warns:
        print(f"⚠ {w}")
    for e in errs:
        print(f"✗ {e}")
    print(f"{'✗' if errs else '✓'} {spec['id']}: {tc(total + tail)}（本編 {body:.1f}秒＋CTA {tail / FPS:g}秒）"
          f" / 字幕 {len(caps)} / big {big} / 警告 {len(warns)}")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
