"""Small, checked media primitives. Inputs stay read-only; intermediate audio stays float."""

import hashlib
import json
import math
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

SR = 48000


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def probe(file):
    p = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            file,
        ],
        capture_output=True,
        text=True,
    )
    return json.loads(p.stdout)


def sha256(file):
    h = hashlib.sha256()
    with open(file, "rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def write_json(file, data):
    file = Path(file)
    tmp = file.with_suffix(file.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    tmp.replace(file)


def natural_key(file):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", str(file))]


def files_in(folder, extensions):
    return sorted(
        (
            p
            for p in Path(folder).rglob("*")
            if p.is_file()
            and not p.name.startswith(".")
            and p.suffix.lower() in extensions
        ),
        key=natural_key,
    )


def finite(value, name, minimum=None):
    if (
        isinstance(value, bool)
        or not isinstance(value, (float, int))
        or not math.isfinite(value)
        or (minimum is not None and value < minimum)
    ):
        raise ValueError(f"{name}: invalid value {value!r}")
    return value


def recording_stamp(file, info):
    """Prefer BWF sample clock. File mtime is never a recording clock."""
    tags = {k.lower(): v for k, v in info.get("format", {}).get("tags", {}).items()}
    audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
    date = tags.get("origination_date") or tags.get("date")
    ref = tags.get("time_reference")
    if ref is not None and date:
        try:
            midnight = (
                datetime.fromisoformat(date[:10])
                .replace(tzinfo=timezone.utc)
                .timestamp()
            )
            return midnight + int(ref) / int(audio["sample_rate"]), "bwf"
        except (ValueError, TypeError):
            pass
    # Recognize common date/time layouts; Hollyland does not document one fixed spelling.
    match = re.search(
        r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[T_ -]?(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})",
        Path(file).stem,
    )
    if match:
        try:
            return datetime(
                *map(int, match.groups()), tzinfo=timezone.utc
            ).timestamp(), "filename-second"
        except ValueError:
            pass
    return None, "natural-order"


def audio_duration(info):
    stream = next(s for s in info["streams"] if s["codec_type"] == "audio")
    d = float(stream.get("duration") or info["format"]["duration"])
    if not math.isfinite(d) or d <= 0:
        raise ValueError("Audio duration is missing or invalid")
    return d


def normalized_audio(source, output, target=-23):
    """Two-pass loudness before any integer conversion: preserves >0 dBFS float samples."""
    base = "highpass=f=70"
    analysis = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(source),
            "-af",
            f"{base},loudnorm=I={target}:TP=-2:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    text = analysis.stderr
    measured = json.loads(text[text.rfind("{") : text.rfind("}") + 1])
    if not all(
        math.isfinite(float(measured[k]))
        for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    ):
        raise ValueError(f"No usable audio for loudness normalization: {source}")
    filt = f"{base},loudnorm=I={target}:TP=-2:LRA=11:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true"
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-af",
            filt,
            "-ar",
            SR,
            "-ac",
            1,
            "-c:a",
            "pcm_f32le",
            "-rf64",
            "auto",
            output,
        ]
    )
