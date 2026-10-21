"""書き出したショートを、タイムコードつきのコマの一覧にする（完成前の見直し用）。

使い方: uv run review.py <id> [--fps 2] [--from 12 --to 14] [--draft]
出力: build/review/<id>/sheet_NN.jpg（1枚に8×3コマ）。全部を画像として開き、おかしい所を探す。
区間を細かく見るときは --fps 10 --from 12 --to 14。--draft は build/<id>-draft.mp4 を見る。
"""
import subprocess
import sys
from pathlib import Path

W = Path.cwd()
FONT = Path("/System/Library/Fonts/Menlo.ttc")


def flag(name, default=None):
    return sys.argv[sys.argv.index(f"--{name}") + 1] if f"--{name}" in sys.argv else default


sid = sys.argv[1]
video = W / "build" / f"{sid}-draft.mp4" if "--draft" in sys.argv else W / "final" / f"magicalfm-{sid}-short.mp4"
if not video.exists():
    sys.exit(f"{video} がない。先に build_short.py --render（--draft）を回す")
fps = flag("fps", "2")
out = W / "build" / "review" / sid
out.mkdir(parents=True, exist_ok=True)
for old in out.glob("sheet_*.jpg"):
    old.unlink()
font = f"fontfile={FONT}:" if FONT.exists() else ""
label = (f"drawtext={font}text='%{{pts\\:hms}}':x=6:y=6:fontsize=18:fontcolor=yellow:"
         "box=1:boxcolor=black@0.6:boxborderw=4")
seek = ["-ss", flag("from")] if flag("from") else []
until = ["-to", flag("to")] if flag("to") else []
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *seek, *until, "-copyts", "-i", str(video),
                "-vf", f"fps={fps},scale=240:-2,{label},tile=8x3:padding=2:color=gray", "-q:v", "3",
                str(out / "sheet_%02d.jpg")], check=True)
sheets = sorted(out.glob("sheet_*.jpg"))
print("\n".join(map(str, sheets)))
print(f"{len(sheets)} 枚（1秒に {fps} コマ、1枚に24コマ）")
