# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""書き出したショートの形式・フレーム数・音量・音声のずれを検査する。

音声のずれは、書き出した MP4 と補正前の音声（public/<id>.wav）の相関で3か所測る。0ms でなければ AAC_DELAY を見直す。
lowMotion は切り出した映像（public/<id>.mp4）の変化が6秒以上小さい区間（ショートの秒。止め絵や、遠くで人が歩くだけの画）。
離脱されやすいので、video で動いている映像を別の時刻から取るか短くする。3つ目の値は LiveShort の寄り（drifts）が掛かっているか。
loudSpots は3秒平均が −11 LUFS を超える所（笑い声・叫び）。
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

W = Path.cwd()


def pcm(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(float)


def low_motion(path, fps=2, least=6.0):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={fps},scale=64:36,format=gray",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64).astype(float)
    still = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2)) <= 1.0
    out, i = [], 0
    while i < len(still):
        j = i
        while j < len(still) and still[j] == still[i]:
            j += 1
        if still[i] and (j - i) / fps >= least:
            out.append([i / fps, (j + 1) / fps])
        i = j
    return out


def loud_spots(path, limit=-11.0):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn", "-af",
                          "ebur128=metadata=1,ametadata=print:key=lavfi.r128.S:file=-", "-f", "null", "-"],
                         capture_output=True, text=True).stdout
    t, spots = 0.0, []
    for line in out.splitlines():
        if line.startswith("frame:"):
            t = float(line.split("pts_time:")[1])
        elif "lavfi.r128.S=" in line and float(line.split("=")[1]) > limit:
            s = round(t - 3, 1)
            if spots and s <= spots[-1][1]:
                spots[-1][1] = round(t, 1)
            else:
                spots.append([max(0.0, s), round(t, 1)])
    return spots


report = {}
for sid in sys.argv[1:]:
    video = W / "final" / f"magicalfm-{sid}-short.mp4"
    props = json.loads((W / "build" / f"{sid}.props.json").read_text())
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries",
                                       "stream=codec_type,width,height,nb_read_frames,r_frame_rate", "-of", "json", str(video)],
                                      capture_output=True, check=True, text=True).stdout)["streams"]
    v = next(s for s in probe if s["codec_type"] == "video")
    loud = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    summary = loud[loud.rindex("Summary:"):]
    lufs = float(summary.split("I:")[1].split("LUFS")[0])
    peak = float(summary.split("Peak:")[1].split("dBFS")[0])
    a, b = pcm(video), pcm(W / "public" / f"{sid}.wav")
    lags = []
    for s in (3, len(b) / 16000 / 2, len(b) / 16000 - 8):
        i = int(s * 16000)
        x, y = a[i:i + 48000], b[i - 1600:i + 48000 + 1600]
        c = np.correlate(y, x, "valid")
        lags.append(round((int(np.argmax(c)) - 1600) / 16, 1))
    report[sid] = {"size": f"{v['width']}x{v['height']}", "fps": v["r_frame_rate"], "frames": int(v["nb_read_frames"]),
                   "expectedFrames": props["durationInFrames"], "lufs": lufs, "truePeak": peak, "audioLagMs": lags,
                   "lowMotion": [[a, b, any(d["startFrame"] <= a * 30 + 15 and b * 30 - 15 <= d["endFrame"] for d in props.get("drifts", []))]
                                 for a, b in low_motion(W / "public" / f"{sid}.mp4")], "loudSpots": loud_spots(video)}
print(json.dumps(report, ensure_ascii=False, indent=1))
