# /// script
# requires-python = ">=3.12"
# dependencies = ["opencv-python-headless==4.12.0.88", "numpy==2.2.6"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""Render feathered oval masks from a complete, source-bound trace (not a detector)."""
import argparse
import hashlib
import json
import math
import subprocess
import time
from fractions import Fraction
from pathlib import Path

import cv2
import numpy as np

STYLE = {"shape": "ellipse", "widthScale": .85, "heightScale": .85,
         "featherFraction": .22, "gaussianSigmaFraction": .095, "roundness": 0, "opacity": 1}


def digest(file):
    with Path(file).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def probe(file):
    data = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(file)]))
    return next(s for s in data["streams"] if s["codec_type"] == "video")


def face_points(box):
    x, y, a, b = box
    cx, cy, w, h = (x + a) / 2, (y + b) / 2, a - x, b - y
    return [(cx - .22 * w, cy - .12 * h), (cx + .22 * w, cy - .12 * h), (cx, cy + .24 * h)]


def covered(point, shapes, feather):
    px, py = point
    return any(((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= (1 - feather) ** 2 + 1e-9 for cx, cy, rx, ry in shapes)


def ellipses(row, style=STYLE):
    def shape(cx, cy, rx, ry):
        radius = max(rx, ry)
        blend = style["roundness"]
        return cx, cy, rx + (radius - rx) * blend, ry + (radius - ry) * blend
    shapes = [shape((x + a) / 2, (y + b) / 2, (a - x) * style["widthScale"] / 2,
                    (b - y) * style["heightScale"] / 2) for x, y, a, b in row["boxes"]]
    for x, y, a, b in row["acceptedFaceCores"]:
        points = face_points([x, y, a, b])
        if not all(covered(point, shapes, style["featherFraction"]) for point in points):
            shapes.append(shape((x + a) / 2, (y + b) / 2, max(4, (a - x) * .60), max(5, (b - y) * .65)))
        if not all(covered(point, shapes, style["featherFraction"]) for point in points):
            raise ValueError("Face center protection failed")
    return sorted(shapes, key=lambda item: item[2] * item[3], reverse=True)


def oval_blur(frame, row, style=STYLE):
    result = frame.copy()
    height, width = frame.shape[:2]
    for cx, cy, rx, ry in ellipses(row, style):
        x, y = max(0, math.floor(cx - rx)), max(0, math.floor(cy - ry))
        a, b = min(width, math.ceil(cx + rx)), min(height, math.ceil(cy + ry))
        if a <= x or b <= y:
            continue
        yy, xx = np.ogrid[y:b, x:a]
        radius = np.sqrt(((xx + .5 - cx) / rx) ** 2 + ((yy + .5 - cy) / ry) ** 2)
        edge = np.clip((1 - radius) / style["featherFraction"], 0, 1)
        alpha = (edge * edge * (3 - 2 * edge)).astype(np.float32)[..., None]
        sigma = max(2.2, min(2 * rx, 2 * ry) * style["gaussianSigmaFraction"])
        blurred = cv2.GaussianBlur(frame[y:b, x:a], (0, 0), sigmaX=sigma, sigmaY=sigma)
        result[y:b, x:a] = np.rint(blurred * alpha + result[y:b, x:a] * (1 - alpha)).astype(np.uint8)
    return result


def load_rows(trace, count, width, height, first, frames):
    selected = []
    seen = 0
    with trace.open() as source:
        for n, line in enumerate(source):
            row = json.loads(line)
            if row.get("frame") != n or not isinstance(row.get("frame"), int):
                raise ValueError(f"Trace must be contiguous from zero; invalid row {n}")
            for field in ["boxes", "acceptedFaceCores"]:
                if not isinstance(row.get(field), list):
                    raise ValueError(f"Missing {field}; this is not a compatible mask trace")
                for box in row[field]:
                    if len(box) != 4 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in box):
                        raise ValueError("Invalid rectangle")
                    x, y, a, b = box
                    if not (0 <= x < a <= width and 0 <= y < b <= height):
                        raise ValueError("Rectangle outside declared output coordinates")
            if first <= n < first + frames:
                selected.append(row)
            seen += 1
    if seen != count or len(selected) != frames:
        raise ValueError(f"Incomplete trace: {seen}/{count}")
    return selected


def write_status(file, value):
    pending = file.with_suffix(file.suffix + ".tmp")
    pending.write_text(json.dumps(value, indent=2) + "\n")
    pending.replace(file)


def render(args):
    output = args.output.resolve()
    pending = output.with_name(output.stem + ".pending.mp4")
    status = output.with_suffix(".status.json")
    if output.suffix.lower() != ".mp4" or any(p.exists() for p in [output, pending, status]):
        raise ValueError("Use a new .mp4 output name; existing outputs and partials are preserved")
    manifest = json.loads(args.manifest.read_text())
    width, height, count = (manifest[key] for key in ["width", "height", "frames"])
    if manifest.get("state") != "ready" or any(type(n) is not int or n < 1 for n in [width, height, count]) or width % 2 or height % 2:
        raise ValueError("Manifest must declare ready state and positive even dimensions")
    fps = Fraction(manifest["fps"])
    if fps <= 0:
        raise ValueError("FPS must be positive")
    source_hash, trace_hash = digest(args.source), digest(args.trace)
    if source_hash != manifest["sourceSha256"] or trace_hash != manifest["traceSha256"]:
        raise ValueError("Source/trace hash mismatch; do not reuse detections for another input")
    source = probe(args.source)
    if int(source["nb_frames"]) != count or Fraction(source["r_frame_rate"]) != fps or Fraction(source["avg_frame_rate"]) != fps:
        raise ValueError("Source clock does not match manifest")
    if abs(float(source.get("start_time", "nan"))) > .001 or not math.isfinite(float(source.get("start_time", "nan"))):
        raise ValueError("Normalize source start PTS to zero before detection")
    if abs(source["width"] / source["height"] - width / height) > .001 or any(s.get("rotation", 0) != 0 for s in source.get("side_data_list", [])):
        raise ValueError("Normalize rotation/aspect ratio before detection")
    colors = {key: source.get(key) for key in ["color_space", "color_transfer", "color_primaries"]}
    if any(value != "bt709" for value in colors.values()):
        raise ValueError(f"Expected normalized SDR BT.709 source; resolve color management before rendering: {colors}")
    first = args.first
    frames = count - first if args.frames is None else args.frames
    if first < 0 or frames < 1 or first + frames > count:
        raise ValueError("Requested frame interval is outside source")
    rows = load_rows(args.trace, count, width, height, first, frames)
    style = {**STYLE, "gaussianSigmaFraction": args.sigma, "widthScale": args.scale, "heightScale": args.scale,
             "roundness": args.roundness, "featherFraction": args.feather}
    if not .5 <= args.scale <= 1.5 or not .03 <= args.sigma <= .3 or not 0 <= args.roundness <= 1 or not .05 <= args.feather <= .35:
        raise ValueError("Use scale .5..1.5, sigma .03..0.3, roundness 0..1 and feather .05..0.35; preview style changes")
    for row in rows:
        ellipses(row, style)
    report = {"state": "validated", "source": str(args.source.resolve()), "output": str(output),
              "sourceSha256": source_hash, "traceSha256": trace_hash, "scriptSha256": digest(__file__),
              "firstFrame": first, "frames": frames, "sourceFrames": count, "fps": str(fps),
              "partial": first != 0 or frames != count, "style": style, "privacyReview": "pending-human-review",
              "styleApproval": "not-recorded-by-helper", "fullEpisodeUpdated": False}
    if args.dry_run:
        print(json.dumps(report, indent=2))
        return
    cv2.setNumThreads(2)
    # Select on the original clock; early seeking only limits decoder work.
    start_time = max(0, first - .25) / float(fps)
    end_time = (first + frames - .25) / float(fps)
    select = f"select='gte(t,{start_time:.12f})*lt(t,{end_time:.12f})',scale={width}:{height}"
    decoder = subprocess.Popen(["ffmpeg", "-v", "error", "-copyts", "-ss", str(max(0, first - 24) / float(fps)),
        "-i", str(args.source), "-an", "-vf", select, "-frames:v", str(frames), "-fps_mode", "passthrough",
        "-pix_fmt", "bgr24", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    encoder = None
    started = time.monotonic()
    try:
        codec = ["-c:v", "h264_videotoolbox", "-b:v", "24M"] if args.encoder == "videotoolbox" else ["-c:v", "libx264", "-crf", "18", "-preset", "fast", "-threads", "4"]
        encoder = subprocess.Popen(["ffmpeg", "-v", "error", "-n", "-f", "rawvideo", "-pix_fmt", "bgr24",
            "-s", f"{width}x{height}", "-r", str(fps), "-i", "-", "-an", "-vf",
            "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709", *codec,
            "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-video_track_timescale", str(fps.numerator), "-movflags", "+faststart", str(pending)], stdin=subprocess.PIPE)
        for index, row in enumerate(rows):
            raw = decoder.stdout.read(width * height * 3)
            if len(raw) != width * height * 3:
                raise ValueError(f"Incomplete source frame {first + index}")
            frame = np.frombuffer(raw, np.uint8).reshape(height, width, 3)
            encoder.stdin.write(oval_blur(frame, row, style).tobytes())
            if (index + 1) % 240 == 0:
                report.update(state="rendering", completedFrames=index + 1, processingFPS=(index + 1) / (time.monotonic() - started))
                write_status(status, report)
                print(f"{index + 1}/{frames} frames", flush=True)
        encoder.stdin.close()
        if decoder.stdout.read(1) or decoder.wait() != 0 or encoder.wait() != 0:
            raise ValueError("Unexpected decoder/encoder completion")
        result = probe(pending)
        if (int(result["nb_frames"]) != frames or Fraction(result["r_frame_rate"]) != fps
                or abs(float(result["duration"]) - frames / float(fps)) > .002
                or result["color_space"] != "bt709" or result["color_range"] != "tv"):
            raise ValueError("Encoded frame clock or color mismatch")
        if digest(args.source) != source_hash or digest(args.trace) != trace_hash or digest(__file__) != report["scriptSha256"]:
            raise ValueError("Inputs changed while rendering")
        pending.rename(output)
        report.update(state="ready", outputSha256=digest(output), acceptedFaceCentralPointsCovered=True,
                      acceptedFaceCoreCount=sum(len(row["acceptedFaceCores"]) for row in rows), completedFrames=frames)
        write_status(status, report)
        print(json.dumps(report, indent=2))
    except Exception as error:
        report.update(state="failed", error=str(error))
        write_status(status, report)
        raise
    finally:
        for child in [decoder, encoder]:
            if child is not None and child.poll() is None:
                child.terminate()
                child.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["source", "trace", "manifest", "output"]:
        parser.add_argument(name, type=Path)
    parser.add_argument("--first", type=int, default=0)
    parser.add_argument("--frames", type=int)
    parser.add_argument("--scale", type=float, default=.85)
    parser.add_argument("--sigma", type=float, default=.095)
    parser.add_argument("--roundness", type=float, default=0, help="0: approved ellipse; 1: circle preserving the longer radius")
    parser.add_argument("--feather", type=float, default=.22)
    parser.add_argument("--encoder", choices=["libx264", "videotoolbox"], default="libx264")
    parser.add_argument("--dry-run", action="store_true")
    render(parser.parse_args())


if __name__ == "__main__":
    main()
