# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""旅Vlogの完成版からショート1本分の映像・音声・propsを作り、Remotionで書き出す。

作業フォルダ（parts.json と specs/ がある場所）で実行する。
spec の時刻はすべて本編（編集後）の秒。segments は音声と映像の採用区間、
video を書くと映像だけ別の区間から取る（合計の長さは segments と揃える）。
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

FPS = 30
AAC_DELAY = 2048
W = Path.cwd()
REPO = Path(__file__).resolve().parents[4]
PARTS = json.loads((W / "parts.json").read_text())
SPEAKER = {"m": "michiru", "u": "upamune"}


def run(cmd, cwd=None):
    subprocess.run(cmd, check=True, cwd=cwd)


def frames(seg):
    return round(seg[0] * FPS), round(seg[1] * FPS)


def expand_video(segs, video):
    """video[i] は segments[i] に合わせる映像。開始秒だけなら同じ長さ、区間の列なら最後の区間の終わりで長さを合わせる。"""
    out = []
    for seg, v in zip(segs, video, strict=True):
        a, b = frames(seg)
        if isinstance(v, (int, float)):
            out.append([v, v + (b - a) / FPS])
            continue
        pieces = [list(x) for x in v]
        used = sum(frames(x)[1] - frames(x)[0] for x in pieces[:-1])
        start = frames(pieces[-1])[0]
        pieces[-1][1] = (start + (b - a) - used) / FPS
        out.extend(pieces)
    return out


def mapper(segs):
    """本編の秒 → ショートのフレーム。区間の隙間は次の区間の頭に寄せる。映像の区間は時刻順でなくてよい。"""
    spans, pos = [], 0
    for a, b in map(frames, segs):
        spans.append((a, b, pos))
        pos += b - a

    def m(t):
        f = round(t * FPS)
        for a, b, p in spans:
            if a <= f < b:
                return p + f - a
        later = [(a, p) for a, b, p in spans if f < a]
        return min(later)[1] if later else pos

    return m, pos


def card_mask(src, start, count):
    """元動画に焼き込まれた「ちょっと待って！」カード（左下の水色・橙の帯）が出ているフレーム。"""
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", f"{start / FPS:.4f}", "-i", src,
                                   "-frames:v", str(count), "-vf", "crop=600:100:100:820,scale=120:20",
                                   "-pix_fmt", "rgb24", "-f", "rawvideo", "-"])
    f = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 20, 120, 3).astype(np.int16)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    teal = (r < 70) & (g > 120) & (b > 120) & (abs(b - g) < 30)
    orange = (r > 150) & (r - g > 70) & (g - b > 40) & (b < 60)
    hit = (teal | orange).mean(axis=(1, 2)) > 0.5
    # 出入りの半透明フレームも含める
    mask = [bool(hit[max(0, i - 6):i + 7].any()) for i in range(len(hit))]
    return mask + [False] * (count - len(mask))


def runs(mask):
    out, i = [], 0
    while i < len(mask):
        j = i
        while j < len(mask) and mask[j] == mask[i]:
            j += 1
        out.append((i, j, mask[i]))
        i = j
    return out


def cut_video(part, segs, out, tail):
    tmp = out.parent / f"{out.stem}-parts"
    tmp.mkdir(exist_ok=True)
    for old in tmp.glob("*.mp4"):
        old.unlink()
    src, off = part["mosaic"], part["offset"]
    listing, cards = [], []
    n = 0
    for si, (a, b) in enumerate(map(frames, segs)):
        mask = card_mask(src, a + off, b - a)
        for i, j, card in runs(mask):
            piece = tmp / f"{n:03d}.mp4"
            n += 1
            last = si == len(segs) - 1 and j == len(mask)
            count = j - i + (tail if last else 0)
            if card:
                # 一時停止中に出るカードなので、直前のカードのないフレームで止め絵にする
                back = card_mask(src, a + off + i - 90, 90)
                clean = max((k for k, c in enumerate(back) if not c), default=None)
                if clean is None:
                    sys.exit(f"カードの前に止め絵にできるフレームがない: {a + i}")
                hold = a + off + i - 90 + clean
                cards.append([a + i, a + j, hold - off])
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{hold / FPS:.4f}", "-i", src, "-frames:v", str(count),
                     "-vf", f"loop=loop={count}:size=1", "-an", "-c:v", "libx264", "-crf", "14",
                     "-pix_fmt", "yuv420p", "-r", str(FPS), str(piece)])
            else:
                # 最後の「続きは本編で！」の間は最後のフレームで止める（先を流すと次の場面が映る）
                vf = f"trim=end_frame={j - i},tpad=stop_mode=clone:stop={tail}" if last else "null"
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{(a + off + i) / FPS:.4f}", "-i", src,
                     "-frames:v", str(count), "-vf", vf, "-an", "-c:v", "libx264", "-crf", "14",
                     "-pix_fmt", "yuv420p", "-r", str(FPS), str(piece)])
            listing.append(f"file '{piece}'")
    (tmp / "list.txt").write_text("\n".join(listing) + "\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"), "-c", "copy", str(out)])
    return cards


def drifts(video):
    """切り出した映像のうち、止め絵が続くカット（3秒以上・7割以上のフレームが止まっている）。LiveShort がゆっくり寄る。"""
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "scale=64:36,format=gray",
                                   "-f", "rawvideo", "-"])
    f = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64).astype(np.int16)
    d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    cuts = [0, *(i + 1 for i, x in enumerate(d) if x > 12), len(f)]
    out = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a >= 3 * FPS and (d[a:b - 1] <= 0.3).mean() >= 0.7:
            out.append({"startFrame": a, "endFrame": b})
    return out


def cut_audio(part, segs, out, tail):
    tmp = out.parent / f"{out.stem}-parts"
    tmp.mkdir(exist_ok=True)
    listing = []
    for i, (a, b) in enumerate(map(frames, segs)):
        piece = tmp / f"{i:02d}.wav"
        dur = (b - a) / FPS
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a / FPS:.4f}", "-t", f"{dur:.4f}", "-i", part["final"], "-vn",
             "-af", f"afade=t=in:d=0.012,afade=t=out:st={dur - 0.012:.4f}:d=0.012", "-ar", "48000", "-ac", "2",
             str(piece)])
        listing.append(f"file '{piece}'")
    (tmp / "list.txt").write_text("\n".join(listing) + "\n")
    raw = tmp / "joined.wav"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
         "-af", f"apad=pad_dur={tail / FPS:.4f}", str(raw)])
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af",
                            "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True).stderr
    st = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
         "loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:"
         f"measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:"
         f"measured_thresh={st['input_thresh']}:offset={st['target_offset']},aresample=48000",
         "-ar", "48000", str(out)])
    # Remotion の AAC は先頭に 2048 サンプルの遅延が入り edit list も書かれないので、その分だけ前に詰めた音声で書き出す
    run(["ffmpeg", "-v", "error", "-y", "-i", str(out), "-af", f"atrim=start_sample={AAC_DELAY},asetpts=PTS-STARTPTS",
         str(out.with_name(f"{out.stem}-render.wav"))])


def main():
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text())
    part = PARTS[spec["part"]]
    sid = spec["id"]
    tail = round(spec.get("tail", 2.0) * FPS)
    segs = spec["segments"]
    vsegs = expand_video(segs, spec["video"]) if "video" in spec else segs
    m, total = mapper(segs)
    vm, vtotal = mapper(vsegs)
    if vtotal != total:
        sys.exit(f"映像 {vtotal} と音声 {total} のフレーム数が違う")

    pub = W / "public"
    pub.mkdir(exist_ok=True)
    for name in ("host-michiru.png", "host-upamune.png"):
        if not (pub / name).exists():
            shutil.copy(REPO / "video/public" / name, pub / name)
    if "--skip-media" not in sys.argv:
        cards = cut_video(part, vsegs, pub / f"{sid}.mp4", tail)
        print(f"カードを止め絵に置換: {cards}")
        cut_audio(part, segs, pub / f"{sid}.wav", tail)

    caps = []
    for c in spec["captions"]:
        caps.append({"startFrame": m(c["at"]), "speaker": SPEAKER[c["s"]], "lines": c["lines"],
                     **({"big": True} if c.get("big") else {})})
    caps.sort(key=lambda c: c["startFrame"])
    for cur, nxt in zip(caps, caps[1:] + [None]):
        cur["endFrame"] = nxt["startFrame"] if nxt else total
    caps = [c for c in caps if c["endFrame"] > c["startFrame"]]

    props = {
        "layout": spec.get("layout", "square"),
        "video": f"{sid}.mp4",
        "audio": f"{sid}-render.wav",
        "durationInFrames": total + tail,
        "bg": spec["bg"],
        "number": spec["number"],
        "series": spec["series"],
        "hookLines": spec["hook"],
        "captions": caps,
        "crops": sorted(({"startFrame": vm(c["at"]), "cx": c["cx"]} for c in spec.get("crops", [])), key=lambda c: c["startFrame"]),
        "drifts": drifts(pub / f"{sid}.mp4") if spec.get("drift", True) else [],
        "ctaFrames": tail,
        **({"location": spec["location"]} if spec.get("location") else {}),
    }
    out = W / "build"
    out.mkdir(exist_ok=True)
    (out / f"{sid}.props.json").write_text(json.dumps(props, ensure_ascii=False, indent=1) + "\n")
    print(f"{sid}: {total + tail} frames ({(total + tail) / FPS:.1f}s), captions {len(caps)}, "
          f"drifts {[(d['startFrame'], d['endFrame']) for d in props['drifts']]}")

    if "--still" in sys.argv:
        frame = sys.argv[sys.argv.index("--still") + 1]
        run(["bunx", "remotion", "still", "src/index.ts", "LiveShort", str(out / f"{sid}-{frame}.png"),
             f"--frame={frame}", f"--props={out / f'{sid}.props.json'}", f"--public-dir={pub}", "--log=error"], cwd=REPO / "video")
    if "--draft" in sys.argv:
        draft = out / f"{sid}-draft.mp4"
        run(["bunx", "remotion", "render", "src/index.ts", "LiveShort", str(draft),
             f"--props={out / f'{sid}.props.json'}", f"--public-dir={pub}", "--scale=0.5", "--crf=26", "--log=error"], cwd=REPO / "video")
        print(draft)
    if "--render" in sys.argv:
        final = W / "final" / f"magicalfm-{sid}-short.mp4"
        final.parent.mkdir(exist_ok=True)
        run(["bunx", "remotion", "render", "src/index.ts", "LiveShort", str(final),
             f"--props={out / f'{sid}.props.json'}", f"--public-dir={pub}", "--crf=16", "--log=error"], cwd=REPO / "video")
        print(final)


if __name__ == "__main__":
    main()
