from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict

from . import io
from .align import align_notes
from .hands import split_note_sequence
from .midi_to_ns import midi_to_note_sequence, midi_tempo_map
from .mxl_parse import parse_score_events
from .nuggets_resolve import resolve_nuggets


def _write_outputs(folder: Path, stem: str, outputs: Dict[str, Dict[str, Any]]) -> None:
    for name, payload in outputs.items():
        io.write_json(folder / f"{stem}.{name}.json", payload)


def build(folder: Path) -> None:
    midi_path, musicxml_path, teacher_path, stem = io.find_inputs(folder)
    teacher = io.load_teacher(teacher_path)
    pipeline_settings = teacher["pipelineSettings"]
    pipeline_settings = {
        **pipeline_settings,
        "sourceMidi": midi_path.name,
        "sourceMusicXml": musicxml_path.name,
    }

    note_sequence = midi_to_note_sequence(str(midi_path), pipeline_settings)
    tempo_map = midi_tempo_map(str(midi_path))
    score_events = parse_score_events(str(musicxml_path), pipeline_settings, tempo_map)

    alignment = align_notes(note_sequence["notes"], score_events, pipeline_settings)
    hands_map = alignment.hands_map

    rh_sequence, lh_sequence = split_note_sequence(note_sequence, hands_map)

    outputs: Dict[str, Dict[str, Any]] = {
        "ns": note_sequence,
        "hands.map": hands_map,
    }
    if rh_sequence:
        outputs["rh.ns"] = rh_sequence
    if lh_sequence:
        outputs["lh.ns"] = lh_sequence

    source_files = {
        "teacher": teacher_path.name,
        "full": f"{stem}.ns.json",
    }
    if rh_sequence:
        source_files["rh"] = f"{stem}.rh.ns.json"
    if lh_sequence:
        source_files["lh"] = f"{stem}.lh.ns.json"

    nuggets_resolved = resolve_nuggets(
        teacher,
        note_sequence,
        alignment.score_matches,
        rh_sequence,
        lh_sequence,
        source_files,
    )
    outputs["nuggets.resolved.v1"] = nuggets_resolved

    _write_outputs(folder, stem, outputs)

    match_rate = hands_map["quality"]["matchRate"]
    print("Tune pipeline complete")
    print(f"Notes: {len(note_sequence['notes'])}")
    print(f"Match rate: {match_rate:.2f}")
    print("Outputs:")
    for name in outputs:
        print(f"  - {stem}.{name}.json")


def main() -> None:
    parser = argparse.ArgumentParser(prog="tune_pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="Build tune artifacts")
    build_parser.add_argument("folder", type=Path)

    args = parser.parse_args()
    if args.command == "build":
        build(args.folder)


if __name__ == "__main__":
    main()
