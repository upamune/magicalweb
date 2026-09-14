# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6", "scipy==1.15.3", "soundfile==0.13.1", "opencv-python-headless==4.12.0.88", "faster-whisper==1.2.1"]
# ///
"""Put internal WAV chunks in mic1/ and mic2/, camera clips in camera/, then run this."""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from itertools import pairwise
from pathlib import Path

from hybrid.audio import align_track, alignment, assemble, features, mix_tracks
from hybrid.faces import MODEL_SHA256, anonymize, ensure_model
from hybrid.media import (
    audio_duration,
    files_in,
    finite,
    normalized_audio,
    probe,
    run,
    sha256,
    write_json,
)

VIDEO = Path(__file__).resolve().parents[1]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("folder", type=Path)
    p.add_argument("--episode", type=int)
    p.add_argument("--title", default="京都の街歩き")
    p.add_argument(
        "--no-transcribe",
        action="store_true",
        help="Prepare media and sync without downloading/running Whisper",
    )
    p.add_argument(
        "--resolve",
        action="store_true",
        help="Create a review project in running Resolve Studio",
    )
    p.add_argument(
        "--render-preset",
        help="Resolve preset to queue after project creation; requires --resolve",
    )
    p.add_argument(
        "--start-render",
        action="store_true",
        help="Start only the newly queued Resolve review render",
    )
    p.add_argument(
        "--model-path",
        type=Path,
        default=VIDEO / "work/models/face_detection_yunet_2023mar.onnx",
    )
    args = p.parse_args()
    if args.render_preset and not args.resolve:
        p.error("--render-preset requires --resolve")
    if args.start_render and not args.render_preset:
        p.error("--start-render requires --render-preset")
    folder = args.folder.resolve()
    config_file = folder / "session.json"
    config = json.loads(config_file.read_text()) if config_file.exists() else {}
    number = args.episode or config.get("episode", {}).get("number")
    if not number:
        match = re.fullmatch(r"ep-(\d+)", folder.name)
        number = int(match[1]) if match else None
    if not isinstance(number, int) or number <= 0:
        p.error("Pass --episode N, or name the folder ep-N")
    source = folder / "source" if (folder / "source").is_dir() else folder
    inputs = {mic: files_in(source / mic, {".wav"}) for mic in ("mic1", "mic2")}
    cameras = files_in(source / "camera", {".mp4", ".mov", ".m4v"})
    for mic, files in inputs.items():
        if not files:
            p.error(f"No internal WAV recordings in {source / mic}")
    speakers = [
        config.get(mic, {}).get("speaker", default)
        for mic, default in [("mic1", "michiru"), ("mic2", "upamune")]
    ]
    if set(speakers) != {"michiru", "upamune"}:
        p.error("mic1/mic2 speaker must map to michiru and upamune exactly once")
    camera_config = config.get("camera", {})
    fps = 24
    detection_width = config.get("faceDetectionWidth", 1280)
    if not isinstance(detection_width, int) or not 320 <= detection_width <= 1920:
        p.error("faceDetectionWidth must be an integer between 320 and 1920")
    inventory = {
        str(f.relative_to(source)): sha256(f)
        for f in inputs["mic1"] + inputs["mic2"] + cameras
    }
    scripts = [Path(__file__), *sorted((VIDEO / "scripts/hybrid").glob("*.py"))]
    key = hashlib.sha256(
        json.dumps(
            {
                "sources": inventory,
                "config": config,
                "number": number,
                "title": args.title,
                "code": [sha256(f) for f in scripts],
                "faceModel": MODEL_SHA256,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()[:20]
    job = folder / "runs" / key
    processed = job / "processed"
    processed.mkdir(parents=True, exist_ok=True)
    report_file = job / "ingest-report.json"
    print(
        f"Run: {job}\nMic assignment: mic1={speakers[0]}, mic2={speakers[1]}",
        flush=True,
    )
    # Resume only a fully completed run whose output bytes still match the report.
    report = json.loads(report_file.read_text()) if report_file.exists() else None
    if report and any(
        not (job / f).is_file() or sha256(job / f) != digest
        for f, digest in report["outputs"].items()
    ):
        raise ValueError(
            "Cached run was edited; keep edits separately or remove this run before retrying"
        )
    if report is None:
        recordings = {}
        for mic, files in inputs.items():
            recordings[mic] = assemble(
                files,
                processed / f"{mic}-raw.wav",
                config.get(mic, {}).get("fileStartSec"),
            )
        ref = features(processed / "mic1-raw.wav")
        sync = alignment(
            ref, processed / "mic2-raw.wav", config.get("mic2", {}).get("sync")
        )
        origin = min(0.0, sync["offsetSec"])
        durations = [
            audio_duration(probe(processed / f"{mic}-raw.wav")) for mic in inputs
        ]
        duration = (
            max(durations[0], sync["offsetSec"] + sync["scale"] * durations[1]) - origin
        )
        aligned = []
        for mic, start, scale in [
            ("mic1", -origin, 1.0),
            ("mic2", sync["offsetSec"] - origin, sync["scale"]),
        ]:
            normalized_audio(
                processed / f"{mic}-raw.wav", processed / f"{mic}-level.wav"
            )
            out = processed / f"{mic}-aligned.wav"
            align_track(processed / f"{mic}-level.wav", out, start, scale, duration)
            aligned.append(out)
        levels = mix_tracks(*aligned, processed / "mix.wav")
        write_json(job / "speaker-levels.json", levels)
        normalized_audio(processed / "mix.wav", processed / "episode-master.wav", -16)
        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                processed / "episode-master.wav",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "192k",
                processed / "episode-master.mp3",
            ]
        )
        master_duration = audio_duration(probe(processed / "episode-master.mp3"))
        master_ref = features(processed / "episode-master.wav")
        video_segments, camera_reports = [], []
        model = ensure_model(args.model_path) if cameras else None
        for index, camera in enumerate(cameras):
            relative = str(camera.relative_to(source / "camera"))
            settings = camera_config.get(relative, {})
            cam_sync = alignment(master_ref, camera, settings.get("sync"))
            info = probe(camera)
            video = next(s for s in info["streams"] if s["codec_type"] == "video")
            if cam_sync["method"] != "manual":
                audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
                cam_sync["offsetSec"] -= cam_sync["scale"] * (
                    float(audio.get("start_time", 0))
                    - float(video.get("start_time", 0))
                )
            name = f"camera-{index + 1:03d}-{key}-clean.mp4"
            result = anonymize(
                camera,
                processed / name,
                model,
                scale=cam_sync["scale"],
                fps=fps,
                detection_width=detection_width,
                extra_masks=settings.get("extraMasks"),
            )
            lead = (
                finite(settings.get("trimStartSec", 0), "trimStartSec", 0)
                * cam_sync["scale"]
            )
            tail = (
                finite(settings.get("trimEndSec", 0), "trimEndSec", 0)
                * cam_sync["scale"]
            )
            start = max(0.0, cam_sync["offsetSec"] + lead)
            end = min(
                master_duration, cam_sync["offsetSec"] + result["durationSec"] - tail
            )
            if end <= start:
                raise ValueError(f"No usable video range after trim: {camera}")
            video_segments.append(
                {
                    "file": name,
                    "timelineStartSec": start,
                    "timelineEndSec": end,
                    "sourceStartSec": start - cam_sync["offsetSec"],
                }
            )
            camera_reports.append(
                {
                    "source": str(camera),
                    "file": name,
                    "sync": cam_sync,
                    "review": result,
                }
            )
        # A switch at the same frame is allowed; ambiguous overlaps must be resolved explicitly.
        video_segments.sort(key=lambda s: s["timelineStartSec"])
        for prev, nxt in pairwise(video_segments):
            if prev["timelineEndSec"] > nxt["timelineStartSec"]:
                raise ValueError(
                    "Camera clips overlap on master timeline; set explicit trimStartSec/trimEndSec in session.json"
                )
        write_json(
            job / "manifest.json",
            {"episodeNumber": number, "videoSegments": video_segments},
        )
        if any(sha256(source / name) != digest for name, digest in inventory.items()):
            raise ValueError("Raw input changed during ingest; retry with fixed inputs")
        report = {
            "version": 1,
            "status": "needs-human-review",
            "episodeNumber": number,
            "sources": inventory,
            "speakers": dict(zip(inputs, speakers)),
            "recordings": recordings,
            "mic2Sync": sync,
            "masterOriginRelativeMic1Sec": origin,
            "masterDurationSec": master_duration,
            "camera": camera_reports,
            "outputs": {
                str(f.relative_to(job)): sha256(f)
                for f in processed.iterdir()
                if f.is_file()
            },
        }
        report["outputs"]["manifest.json"] = sha256(job / "manifest.json")
        report["outputs"]["speaker-levels.json"] = sha256(job / "speaker-levels.json")
        write_json(report_file, report)
    if not args.no_transcribe:
        from hybrid.transcript import transcribe

        transcript = job / "transcript.json"
        if not transcript.exists():
            levels = json.loads((job / "speaker-levels.json").read_text())
            transcribe(
                processed / "episode-master.mp3",
                transcript,
                levels,
                speakers,
                config.get("transcriptionModel", "large-v3-turbo"),
                config.get("transcriptionDevice", "cpu"),
            )
        episode = {
            "number": number,
            "title": args.title,
            "pubDate": datetime.now(timezone.utc).astimezone().date().isoformat(),
            **config.get("episode", {}),
        }
        episode["number"] = number
        write_json(job / "episode-meta.json", episode)
        run(
            [
                "bun",
                VIDEO / "scripts/build-episode.mjs",
                number,
                "--audio",
                processed / "episode-master.mp3",
                "--transcript",
                transcript,
                "--episode-meta",
                job / "episode-meta.json",
                "--no-proofread",
                "--speakers",
                "michiru=michiru,upamune=upamune",
            ],
            cwd=VIDEO,
        )
    write_json(
        folder / "latest-run.json",
        {"run": str(job.relative_to(folder)), "status": "needs-human-review"},
    )
    if args.resolve:
        from hybrid.resolve import connect, create_review_project

        result = create_review_project(
            connect(), job, args.render_preset, args.start_render
        )
        write_json(job / "resolve-project.json", result)
    print(
        f"Finished: {job}\nHuman privacy review is still required. After review, prepare manifest.json with --reviewed. No review receipt was fabricated.",
        flush=True,
    )


if __name__ == "__main__":
    main()
