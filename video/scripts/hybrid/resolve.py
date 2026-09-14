"""Resolve Studio bridge. Uses the installed vendor scripting module, never screen coordinates."""

import importlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def connect():
    roots = [
        os.environ.get("RESOLVE_SCRIPT_API"),
        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting",
        "/opt/resolve/Developer/Scripting",
        str(
            Path(os.environ.get("PROGRAMDATA", "C:/ProgramData"))
            / "Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting"
        ),
    ]
    for root in filter(None, roots):
        module = Path(root) / "Modules"
        if module.is_dir():
            sys.path.insert(0, str(module))
    try:
        resolve = importlib.import_module("DaVinciResolveScript").scriptapp("Resolve")
    except ImportError as exc:
        raise RuntimeError(
            "Resolve scripting module unavailable. Run this on the Resolve Studio computer with its Developer/Scripting package installed."
        ) from exc
    if resolve is None:
        raise RuntimeError(
            "Start Resolve Studio and enable Preferences > System > General > External scripting using: Local, then retry."
        )
    return resolve


def checked(value, message):
    if value is None or value is False or value == []:
        raise RuntimeError(message)
    return value


def create_review_project(resolve, job, render_preset=None, start_render=False):
    """Always create a NEW project. Never overwrite an existing edit or auto-approve privacy."""
    job = Path(job).resolve()
    report = json.loads((job / "ingest-report.json").read_text())
    manifest = json.loads((job / "manifest.json").read_text())
    manager = checked(resolve.GetProjectManager(), "GetProjectManager failed")
    name = f"magicalweb-ep{report['episodeNumber']}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}"
    project = checked(
        manager.CreateProject(name), "Could not create a new Resolve project"
    )
    fps = 24
    checked(
        project.SetSetting("timelineFrameRate", str(fps)),
        "Could not set timeline frame rate",
    )
    checked(
        project.SetSetting("timelineResolutionWidth", "1920"),
        "Could not set timeline width",
    )
    checked(
        project.SetSetting("timelineResolutionHeight", "1080"),
        "Could not set timeline height",
    )
    pool = checked(project.GetMediaPool(), "Media pool unavailable")
    timeline = checked(
        pool.CreateEmptyTimeline("Podcast master — privacy review pending"),
        "Could not create timeline",
    )
    checked(project.SetCurrentTimeline(timeline), "Could not select timeline")
    checked(
        timeline.SetStartTimecode("00:00:00:00"), "Could not set master timeline origin"
    )
    # Only the finished master is placed on an audio track; camera audio is never imported here.
    audio_path = job / "processed/episode-master.wav"
    audio = checked(
        pool.ImportMedia([str(audio_path)]), "Could not import master audio"
    )[0]
    checked(
        pool.AppendToTimeline(
            [
                {
                    "mediaPoolItem": audio,
                    "mediaType": 2,
                    "trackIndex": 1,
                    "recordFrame": 0,
                }
            ]
        ),
        "Could not place master audio",
    )
    # Aligned stems are available in the media pool for edits, but are not double-played.
    checked(
        pool.ImportMedia(
            [
                str(job / "processed/mic1-aligned.wav"),
                str(job / "processed/mic2-aligned.wav"),
            ]
        ),
        "Could not import aligned mic stems",
    )
    for index, segment in enumerate(manifest["videoSegments"]):
        media = checked(
            pool.ImportMedia([str(job / "processed" / segment["file"])]),
            f"Could not import {segment['file']}",
        )[0]
        start = math.ceil(segment["timelineStartSec"] * fps)
        count = math.ceil(segment["timelineEndSec"] * fps) - start
        trim = round(
            (segment["sourceStartSec"] + start / fps - segment["timelineStartSec"])
            * fps
        )
        checked(
            pool.AppendToTimeline(
                [
                    {
                        "mediaPoolItem": media,
                        "startFrame": trim,
                        "endFrame": trim + count - 1,
                        "mediaType": 1,
                        "trackIndex": 1,
                        "recordFrame": start,
                    }
                ]
            ),
            "Could not place clean video",
        )
        checked(
            timeline.AddMarker(
                start,
                "Orange",
                f"REVIEW VIDEO {index + 1}",
                "Automatic detection is not privacy approval. Review the entire used range.",
                count,
                f"magicalweb-segment-{index}",
            ),
            "Could not add review marker",
        )
        camera = next(c for c in report["camera"] if c["file"] == segment["file"])
        for window in camera["review"]["reviewWindows"]:
            master = (
                segment["timelineStartSec"]
                + window["startSec"]
                - segment["sourceStartSec"]
            )
            frame = round(master * fps)
            if start < frame < math.ceil(segment["timelineEndSec"] * fps):
                checked(
                    timeline.AddMarker(
                        frame,
                        "Yellow",
                        "FACE REVIEW",
                        f"Detections: {window['faces']}; zero-detection frames: {window['zeroFrames']}; low-confidence frames: {window['lowConfidenceFrames']}. Zero does not mean safe.",
                        1,
                        f"magicalweb-face-{index}-{frame}",
                    ),
                    "Could not add face review marker",
                )
    checked(manager.SaveProject(), "Could not save Resolve project")
    drp = job / f"{name}.drp"
    checked(
        manager.ExportProject(name, str(drp)), "Could not export Resolve project backup"
    )
    result = {
        "project": name,
        "backup": str(drp),
        "status": "needs-human-review",
        "renderJob": None,
    }
    if start_render and not render_preset:
        raise ValueError("--start-render requires a named --render-preset")
    if render_preset:
        checked(
            project.LoadRenderPreset(render_preset),
            f"Render preset not found: {render_preset}",
        )
        target = job / "resolve-render"
        target.mkdir(exist_ok=True)
        checked(
            project.SetRenderSettings(
                {
                    "TargetDir": str(target),
                    "CustomName": f"ep-{report['episodeNumber']}-review",
                    "SelectAllFrames": True,
                }
            ),
            "Could not set render settings",
        )
        job_id = checked(project.AddRenderJob(), "Could not queue render job")
        result["renderJob"] = job_id
        if start_render:
            # Never run unrelated queued jobs: pass only the ID created above.
            checked(
                project.StartRendering([job_id]),
                "Could not start the requested render job",
            )
            result["renderStarted"] = True
    resolve.OpenPage("edit")
    return result
