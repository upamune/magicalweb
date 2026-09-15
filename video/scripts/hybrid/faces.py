"""Local face detection + burned-in pixelation. Every output remains pending human review."""

import json
import math
import subprocess
import urllib.request
from pathlib import Path

import cv2

from .media import finite, run, sha256, write_json

MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
MODEL_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"


def ensure_model(file):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    if not file.exists():
        tmp = file.with_suffix(".download")
        try:
            with (
                urllib.request.urlopen(MODEL_URL, timeout=60) as response,
                open(tmp, "wb") as out,
            ):
                while block := response.read(1024 * 1024):
                    out.write(block)
            if sha256(tmp) != MODEL_SHA256:
                raise ValueError("YuNet model checksum mismatch")
            tmp.replace(file)
        finally:
            tmp.unlink(missing_ok=True)
    if sha256(file) != MODEL_SHA256:
        raise ValueError(f"Unexpected face model: {file}")
    file.with_suffix(".LICENSE.txt").write_text(
        Path(__file__).with_name("YUNET-LICENSE.txt").read_text()
    )
    return file


def expanded_box(box, width, height, margin=0.35):
    x, y, w, h = box[:4]
    return [
        max(0, int(x - w * margin)),
        max(0, int(y - h * margin)),
        min(width, math.ceil(x + w * (1 + margin))),
        min(height, math.ceil(y + h * (1 + margin))),
    ]


def pixelate(frame, boxes):
    for x1, y1, x2, y2 in boxes:
        if x2 <= x1 or y2 <= y1:
            continue
        roi = frame[y1:y2, x1:x2]
        tiny = cv2.resize(
            roi, (min(8, x2 - x1), min(8, y2 - y1)), interpolation=cv2.INTER_AREA
        )
        tiny = cv2.GaussianBlur(tiny, (3, 3), 0)
        frame[y1:y2, x1:x2] = cv2.resize(
            tiny, (x2 - x1, y2 - y1), interpolation=cv2.INTER_LINEAR
        )
    return frame


def anonymize(
    source,
    output,
    model,
    scale=1.0,
    fps=24,
    detection_width=1280,
    threshold=0.65,
    extra_masks=None,
):
    cv2.setNumThreads(4)
    for mask in extra_masks or []:
        start = finite(mask.get("startSec"), "mask.startSec", 0)
        end = finite(mask.get("endSec"), "mask.endSec", 0)
        rect = mask.get("rect")
        if end <= start or not isinstance(rect, list) or len(rect) != 4:
            raise ValueError(
                "Extra mask requires startSec < endSec and rect [x,y,width,height]"
            )
        x, y, w, h = [finite(v, "mask.rect", 0) for v in rect]
        if w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
            raise ValueError(
                "Extra mask rectangle must fit normalized 0..1 video coordinates"
            )
    # Normalize rotation, frame rate and clock BEFORE detection. No separate mask/video timebases.
    normalized = output.with_name(output.stem + "-normalized.mp4")
    run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            f"setpts=(PTS-STARTPTS)*{scale:.12f},fps={fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            normalized,
        ]
    )
    cap = cv2.VideoCapture(str(normalized))
    if not cap.isOpened():
        raise ValueError(f"Cannot decode {normalized}")
    width, height = (
        int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    )
    expected = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    dw = min(width, detection_width)
    dh = round(height * dw / width)
    detector = cv2.FaceDetectorYN.create(str(model), "", (dw, dh), threshold, 0.3, 5000)
    tmp = output.with_suffix(".tmp.mp4")
    encoder = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{height}",
            "-r",
            str(fps),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(tmp),
        ],
        stdin=subprocess.PIPE,
    )
    trace_file = output.with_suffix(".faces.jsonl")
    stats = {
        "status": "needs-human-review",
        "modelSha256": MODEL_SHA256,
        "sourceSha256": sha256(source),
        "frames": 0,
        "framesWithDetections": 0,
        "zeroDetectionFrames": 0,
        "faceDetections": 0,
        "reviewWindows": [],
    }
    history = []
    windows = {}
    try:
        with open(trace_file, "w") as trace:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                n = stats["frames"]
                _, detections = detector.detect(cv2.resize(frame, (dw, dh)))
                boxes, scores = [], []
                for face in [] if detections is None else detections:
                    box = face[:4] * (width / dw)
                    boxes.append(expanded_box(box, width, height))
                    scores.append(float(face[-1]))
                # Retain recent expanded regions to cover single-frame detection dropouts.
                history = [(i, b) for i, b in history if n - i <= math.ceil(fps * 0.25)]
                history.extend((n, b) for b in boxes)
                masks = [b for _, b in history]
                for mask in extra_masks or []:
                    if mask["startSec"] <= n / fps < mask["endSec"]:
                        x, y, w, h = mask["rect"]
                        masks.append(
                            expanded_box(
                                [x * width, y * height, w * width, h * height],
                                width,
                                height,
                                0,
                            )
                        )
                encoder.stdin.write(pixelate(frame, masks).tobytes())
                trace.write(
                    json.dumps({"frame": n, "boxes": boxes, "scores": scores}) + "\n"
                )
                stats["frames"] += 1
                stats["faceDetections"] += len(boxes)
                stats["framesWithDetections"] += bool(boxes)
                stats["zeroDetectionFrames"] += not bool(boxes)
                bucket = windows.setdefault(
                    n // (fps * 20),
                    {"faces": 0, "zeroFrames": 0, "lowConfidenceFrames": 0},
                )
                bucket["faces"] += len(boxes)
                bucket["zeroFrames"] += not bool(boxes)
                bucket["lowConfidenceFrames"] += any(score < 0.8 for score in scores)
                if n % (fps * 10) == 0:
                    print(
                        f"face detection {source.name}: {n / fps:.0f}s / {expected / fps:.0f}s",
                        flush=True,
                    )
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError("Face video encoder failed")
        if stats["frames"] != expected or not stats["frames"]:
            raise ValueError(
                f"Decoder stopped early: {stats['frames']}/{expected} frames"
            )
        tmp.replace(output)
        stats["outputSha256"] = sha256(output)
        stats["durationSec"] = stats["frames"] / fps
        stats["reviewWindows"] = [
            dict(startSec=k * 20, endSec=min((k + 1) * 20, stats["durationSec"]), **v)
            for k, v in windows.items()
        ]
        write_json(output.with_suffix(".review.json"), stats)
        return stats
    finally:
        cap.release()
        if encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        tmp.unlink(missing_ok=True)
        normalized.unlink(missing_ok=True)
