"""本編の文字起こし（ElevenLabs Scribe の生JSON）を、話者と0.35秒以上の間で区切って時刻つきで表示する。

使い方: uv run words.py <part> <開始秒> <終了秒> [--chars]
--chars を付けると1文字ずつの時刻を出す（切る位置・字幕の出だしを決めるとき）。
"""
import json
import sys
from pathlib import Path

PARTS = json.loads((Path.cwd() / "parts.json").read_text())
part, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
words = [w for w in json.load(open(PARTS[part]["transcript"]))["words"] if w["type"] != "spacing"]
if "--chars" in sys.argv:
    print(" ".join(f"{w['text']}@{w['start']:.2f}" for w in words if a <= w["start"] <= b))
    sys.exit()
cur, buf, t0 = None, "", 0
for w in words:
    if w["end"] < a or w["start"] > b:
        continue
    sp = w.get("speaker_id", "?")[-1]
    gap = buf and (w["start"] - last > 0.35)
    if sp != cur or gap:
        if buf:
            print(f"{t0:7.2f}-{last:7.2f} {cur} {buf}")
        cur, buf, t0 = sp, "", w["start"]
    buf += w["text"]
    last = w["end"]
if buf:
    print(f"{t0:7.2f}-{last:7.2f} {cur} {buf}")
