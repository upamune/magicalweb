"""Run on the Resolve Studio host after hybrid_pipeline.py. No third-party Python packages required."""

import argparse
from pathlib import Path

from hybrid.media import write_json
from hybrid.resolve import connect, create_review_project


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "run", type=Path, help="runs/<id> directory printed by hybrid_pipeline.py"
    )
    p.add_argument("--render-preset", help="Existing Resolve delivery preset name")
    p.add_argument(
        "--start-render",
        action="store_true",
        help="Start ONLY the render job created by this command",
    )
    args = p.parse_args()
    if args.start_render and not args.render_preset:
        p.error("--start-render requires --render-preset")
    result = create_review_project(
        connect(), args.run, args.render_preset, args.start_render
    )
    write_json(args.run / "resolve-project.json", result)
    print(result)


if __name__ == "__main__":
    main()
