# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Two-pass loudness mastering of an already cleaned dialogue mix; no source overwrite."""
import argparse
import json
import math
import re
import subprocess
from pathlib import Path


def measure(source, filters, destination=None):
    command = ["ffmpeg", "-hide_banner", "-nostats", "-n", "-i", str(source), "-vn", "-af", filters]
    command += ["-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(destination)] if destination else ["-f", "null", "-"]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not matches:
        raise ValueError("No loudnorm measurement in ffmpeg output")
    values = json.loads(matches[-1])
    if not all(math.isfinite(float(values[key])) for key in ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]):
        raise ValueError("No usable audio or invalid loudness measurement")
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--highpass", type=float, default=0)
    parser.add_argument("--target-lufs", type=float, default=-16)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.source.is_file() or args.output.suffix.lower() != ".wav":
        parser.error("Source must exist and output must be a new .wav file")
    if not 0 <= args.highpass <= 200 or not -70 <= args.target_lufs <= -5:
        parser.error("Use highpass 0..200Hz and target LUFS -70..-5")
    pending = args.output.with_name(args.output.stem + ".pending.wav")
    receipt = args.output.with_suffix(".loudness.json")
    if any(p.exists() for p in [args.output, pending, receipt]):
        parser.error("Output, pending file or receipt exists; choose a new version name")
    # Normalize channels before measuring so a mono-to-stereo conversion does not shift LUFS afterward.
    base = "aformat=sample_rates=48000:channel_layouts=stereo,"
    if args.highpass:
        base += f"highpass=f={args.highpass}:p=2,"
    target = f"loudnorm=I={args.target_lufs}:TP=-1.5:LRA=9"
    if args.dry_run:
        print(json.dumps({"source": str(args.source), "output": str(args.output), "filters": base + target}))
        return
    measured = measure(args.source, base + target + ":print_format=json")
    filters = (f"{base}{target}:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
               f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
               f":offset={measured['target_offset']}:linear=false:print_format=json")
    rendered = measure(args.source, filters, pending)
    verified = measure(pending, target + ":print_format=json")
    if abs(float(verified["input_i"]) - args.target_lufs) > .5 or float(verified["input_tp"]) > -1:
        raise ValueError("Master outside target; pending WAV retained for investigation")
    def audio_info(file):
        info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(file)]))
        return next(s for s in info["streams"] if s["codec_type"] == "audio")
    original, result = audio_info(args.source), audio_info(pending)
    if abs(float(original["duration"]) - float(result["duration"])) > .002:
        raise ValueError("Master duration changed; do not retime captions to conceal it")
    pending.rename(args.output)
    report = {"state": "master-ready", "source": str(args.source.resolve()), "output": str(args.output.resolve()),
              "input": measured, "render": rendered, "verified": verified, "filters": filters}
    receipt.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
