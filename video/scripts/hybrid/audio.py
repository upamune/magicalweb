import itertools
import math

import numpy as np
import soundfile as sf
from scipy import signal

from .media import SR, audio_duration, finite, natural_key, probe, recording_stamp, run

FEATURE_HZ = 100


def assemble(files, output, offsets=None):
    """Reassemble a transmitter's size-split files. Preserve real gaps from its clock."""
    if not files:
        raise ValueError(f"No WAV files for {output.name}")
    rows = []
    for file in files:
        info = probe(file)
        audio = [s for s in info["streams"] if s["codec_type"] == "audio"]
        if len(audio) != 1 or int(audio[0].get("channels", 0)) != 1:
            raise ValueError(
                f"Expected one mono internal TX recording: {file}; stereo receiver recordings need explicit channel separation"
            )
        stamp, precision = recording_stamp(file, info)
        rows.append(
            {
                "file": file,
                "duration": audio_duration(info),
                "stamp": stamp,
                "precision": precision,
                "codec": audio[0].get("codec_name"),
                "sampleRate": int(audio[0]["sample_rate"]),
            }
        )
    if offsets is None and all(r["stamp"] is not None for r in rows):
        rows.sort(key=lambda r: (r["stamp"], natural_key(r["file"])))
    if offsets is None and len(rows) > 1 and any(r["stamp"] is None for r in rows):
        print(
            f"{output.name}: no complete recording clock; concatenating in natural filename order. Set fileStartSec for stop/restart gaps.",
            flush=True,
        )
    cursor = 0
    origin = rows[0]["stamp"]
    with sf.SoundFile(
        output, "w", samplerate=SR, channels=1, subtype="FLOAT", format="RF64"
    ) as dest:
        for index, row in enumerate(rows):
            if offsets is not None:
                if len(offsets) != len(rows):
                    raise ValueError(
                        "fileStartSec must have one value per naturally ordered input file"
                    )
                position = finite(offsets[index], "fileStartSec", 0)
            elif row["stamp"] is not None and origin is not None:
                position = row["stamp"] - origin
                # A one-second filename cannot locate a split within that second.
                # Adjacent size splits use exact sample counts instead of accumulating clock rounding.
                tolerance = 1.01 if row["precision"] == "filename-second" else 1 / SR
                if abs(position - cursor / SR) <= tolerance:
                    position = cursor / SR
            else:
                position = cursor / SR
            start = round(position * SR)
            if start < cursor:
                raise ValueError(
                    f"Overlapping/out-of-order recordings: {row['file']}; supply fileStartSec or separate sessions"
                )
            gap = start - cursor
            while gap:
                count = min(gap, SR * 10)
                dest.write(np.zeros(count, dtype=np.float32))
                gap -= count
            decoded = output.with_name(f".decode-{index}.wav")
            run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-i",
                    row["file"],
                    "-map",
                    "0:a:0",
                    "-ac",
                    1,
                    "-ar",
                    SR,
                    "-c:a",
                    "pcm_f32le",
                    "-rf64",
                    "auto",
                    decoded,
                ]
            )
            samples = 0
            with sf.SoundFile(decoded) as src:
                for block in src.blocks(blocksize=SR * 10, dtype="float32"):
                    if not np.isfinite(block).all():
                        raise ValueError(f"Non-finite audio samples: {row['file']}")
                    dest.write(block)
                    samples += len(block)
            decoded.unlink()
            row["startSec"] = start / SR
            row["duration"] = samples / SR
            row["gapBeforeSec"] = (start - cursor) / SR
            row["file"] = str(row["file"])
            cursor = start + samples
    return rows


def features(file):
    # RMS speech-band envelope is more robust than waveform phase to two lav positions.
    raw = run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            file,
            "-map",
            "0:a:0",
            "-ac",
            1,
            "-af",
            "highpass=f=120,lowpass=f=3500",
            "-ar",
            8000,
            "-f",
            "f32le",
            "-",
        ],
        capture_output=True,
    ).stdout
    samples = np.frombuffer(raw, dtype="<f4")
    if not np.isfinite(samples).all():
        raise ValueError(f"Non-finite samples in {file}")
    n = 8000 // FEATURE_HZ
    if len(samples) < n * 200:
        raise ValueError(
            "At least two seconds of audio are required for automatic synchronization"
        )
    rms = np.sqrt(
        np.mean(
            samples[: len(samples) // n * n].reshape(-1, n).astype(np.float64) ** 2,
            axis=1,
        )
    )
    # Remove slow ambient variation, keeping the voice syllable pattern.
    log = np.log(np.maximum(rms, max(float(rms.max()) * 1e-5, 1e-12)))
    return log - signal.savgol_filter(log, 101 if len(log) >= 101 else 11, 2)


def estimate_sync(reference, target, min_score=0.40):
    """Fit reference_time = offset + scale * target_time from independent windows."""
    ref = np.asarray(reference, dtype=np.float64)
    other = np.asarray(target, dtype=np.float64)
    win = min(2000, len(other) // 5, len(ref) // 3)
    if win < 100:
        raise ValueError("Too little overlapping audio for automatic sync")
    sums = np.concatenate(([0.0], np.cumsum(ref)))
    squares = np.concatenate(([0.0], np.cumsum(ref * ref)))
    energy = np.maximum(
        0, squares[win:] - squares[:-win] - (sums[win:] - sums[:-win]) ** 2 / win
    )
    anchors = []
    for start in sorted(set(np.linspace(0, len(other) - win, 9).astype(int))):
        needle = other[start : start + win].copy()
        needle -= needle.mean()
        norm = np.linalg.norm(needle)
        if norm < 1e-6:
            continue
        corr = signal.correlate(ref, needle, mode="valid", method="fft") / np.maximum(
            np.sqrt(energy) * norm, 1e-12
        )
        peak = int(np.argmax(corr))
        score = float(corr[peak])
        rivals = corr.copy()
        rivals[max(0, peak - 100) : peak + 101] = -1
        margin = score - float(rivals.max(initial=-1))
        if score >= min_score and margin >= 0.04:
            anchors.append(
                {
                    "targetSec": (start + win / 2) / FEATURE_HZ,
                    "referenceSec": (peak + win / 2) / FEATURE_HZ,
                    "score": score,
                }
            )
    best = []
    for a, b in itertools.combinations(anchors, 2):
        dx = b["targetSec"] - a["targetSec"]
        if dx < 1:
            continue
        scale = (b["referenceSec"] - a["referenceSec"]) / dx
        if abs(scale - 1) > 0.002:
            continue
        offset = a["referenceSec"] - scale * a["targetSec"]
        fit = [
            p
            for p in anchors
            if abs(p["referenceSec"] - offset - scale * p["targetSec"]) <= 0.035
        ]
        if len(fit) > len(best):
            best = fit
    required = 3
    if (
        len(best) < required
        or max(p["targetSec"] for p in best) - min(p["targetSec"] for p in best)
        < len(other) / FEATURE_HZ * 0.45
    ):
        raise ValueError(
            f"Uncertain sync: {len(best)} consistent anchors across insufficient coverage; provide offsetSec/scale in session.json after checking audio"
        )
    x = np.array([p["targetSec"] for p in best])
    y = np.array([p["referenceSec"] for p in best])
    scale, offset = np.polyfit(x, y, 1)
    residual = float(np.max(np.abs(y - (offset + scale * x))))
    if residual > 0.04 or abs(scale - 1) > 0.002:
        raise ValueError(
            "Non-linear clock drift; split/correct this recording before proceeding"
        )
    return {
        "offsetSec": float(offset),
        "scale": float(scale),
        "maxResidualSec": residual,
        "driftPpm": float((scale - 1) * 1e6),
        "anchors": best,
        "method": "waveform-envelope",
    }


def alignment(ref, target, override=None):
    if override is None:
        return estimate_sync(ref, features(target))
    offset = finite(override.get("offsetSec"), "offsetSec")
    scale = finite(override.get("scale", 1), "scale", 0.9)
    if scale > 1.1:
        raise ValueError("scale is outside a clock correction range")
    return {"offsetSec": offset, "scale": scale, "method": "manual", "anchors": []}


def align_track(source, out, start, scale, duration):
    # Clock correction by sample-rate conversion; any pitch change is limited to small clock drift.
    filt = f"asetrate={SR / scale:.9f},aresample={SR},adelay={round(start * SR)}S:all=1,apad,atrim=end_sample={round(duration * SR)}"
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
            "-ac",
            1,
            "-ar",
            SR,
            "-c:a",
            "pcm_f32le",
            "-rf64",
            "auto",
            out,
        ]
    )


def mix_tracks(mic1, mic2, output):
    """Smooth gain sharing reduces the off-mic copy without deleting anyone's samples."""
    step = SR // 100
    levels = [[], []]
    gains = np.array([0.5, 0.5])
    with (
        sf.SoundFile(mic1) as a,
        sf.SoundFile(mic2) as b,
        sf.SoundFile(
            output, "w", samplerate=SR, channels=1, subtype="FLOAT", format="RF64"
        ) as out,
    ):
        if a.frames != b.frames:
            raise ValueError("Aligned tracks must have identical sample counts")
        for _ in range(math.ceil(a.frames / step)):
            x, y = a.read(step, dtype="float32"), b.read(step, dtype="float32")
            powers = np.array(
                [np.mean(x.astype(float) ** 2), np.mean(y.astype(float) ** 2)]
            )
            levels[0].append(float(np.sqrt(powers[0])))
            levels[1].append(float(np.sqrt(powers[1])))
            weights = np.maximum(powers, 1e-12) ** 0.7
            target = 0.12 + 0.76 * weights / weights.sum()
            next_gains = gains + 0.15 * (target - gains)
            ramp = np.linspace(gains, next_gains, len(x))
            out.write(x * ramp[:, 0] + y * ramp[:, 1])
            gains = next_gains
    return levels
