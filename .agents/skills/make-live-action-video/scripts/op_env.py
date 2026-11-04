# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6", "soundfile==0.13.1"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""Write the OP with the approved level curve: loud over the highlight, then fading under the voice."""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf

OP = "/Users/upamune/Music/Logic/magicalfm_op_1.wav"
# dB relative to the highlight level: drop within 0.6 s of the first voice, then (seconds into the OP, dB).
UNDER_VOICE_DB = -17
FADE = [(28, -18), (40, -20), (52, -22), (62, -24), (76, -28), (86, -33), (93, -42)]


def envelope(seconds, voice, duration, highlight_db):
    points = [(0, 0), (voice, 0), (voice + 0.6, UNDER_VOICE_DB)] + [p for p in FADE if p[0] > voice + 0.6] + [(duration, -70)]
    return highlight_db + np.interp(seconds, [p[0] for p in points], [p[1] for p in points]), points


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("voice_start", type=float, help="first voice in the output timeline, seconds from the OP start")
    parser.add_argument("--op", default=OP)
    parser.add_argument("--highlight-db", type=float, default=8)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Use a new output name")
    audio, rate = sf.read(args.op, dtype="float32", always_2d=True)
    seconds = np.arange(len(audio)) / rate
    gain_db, points = envelope(seconds, args.voice_start, len(audio) / rate, args.highlight_db)
    gain = 10 ** (gain_db / 20)
    tail = min(len(gain), int(0.5 * rate))
    gain[-tail:] *= np.linspace(1, 0, tail)
    sf.write(args.output, (audio * gain[:, None]).astype(np.float32), rate, subtype="FLOAT")
    args.output.with_suffix(".json").write_text(json.dumps({"op": args.op, "voiceStart": args.voice_start, "highlightDb": args.highlight_db, "pointsDb": points}, indent=1) + "\n")
    print(json.dumps({"output": str(args.output), "sampleRate": rate, "seconds": round(len(audio) / rate, 3)}))


if __name__ == "__main__":
    main()
