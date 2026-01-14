from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, Optional

from music21 import converter, instrument, stream

from tune_pipeline.io import read_json, write_json
from tune_pipeline.midi_to_ns import midi_to_note_sequence
from tune_pipeline.mxl_unpack import unpack_mxl
from tune_pipeline.nuggets_resolve import resolve_nuggets
from tune_pipeline.validate_teacher import validate_teacher
from tune_pipeline.xml_split_hands import HandSplitResult, split_by_staff
from tune_pipeline.xml_to_midi import write_midi


class PipelineError(RuntimeError):
    pass


def _select_part(score: stream.Score) -> stream.Part:
    for part in score.parts:
        if part.getInstrument(returnDefault=False):
            inst = part.getInstrument(returnDefault=False)
            if isinstance(inst, instrument.Piano):
                return part
        part_name = (part.partName or "").lower()
        if "piano" in part_name:
            return part
    return score.parts[0]


def _write_musicxml(score: stream.Score, path: Path) -> Path:
    score.write("musicxml", fp=str(path))
    return path


def build_tune(tune_folder: Path) -> Dict[str, object]:
    if not tune_folder.exists():
        raise PipelineError(f"Folder not found: {tune_folder}")
    xml_path = tune_folder / "tune.xml"
    mxl_path = tune_folder / "tune.mxl"
    if not xml_path.exists():
        unpack_mxl(mxl_path, xml_path)
    base_name = xml_path.stem
    teacher_path = tune_folder / "teacher.json"
    teacher = None
    if teacher_path.exists():
        teacher = read_json(teacher_path)
        validate_teacher(teacher)
    score = converter.parse(str(xml_path))
    part = _select_part(score)
    midi_path = tune_folder / f"{base_name}.mid"
    write_midi(score, midi_path)
    note_sequences: Dict[str, Dict[str, object]] = {
        "full": midi_to_note_sequence(midi_path),
    }
    tracks: Dict[str, Dict[str, object]] = {
        "full": {
            "notesCount": len(note_sequences["full"]["notes"]),
            "noteSequenceFile": f"{base_name}.ns.json",
        }
    }
    split_result: Optional[HandSplitResult] = None
    if teacher:
        settings = teacher.get("pipelineSettings", {})
        hand_policy = settings.get("handSplitPolicy", {})
        mode = hand_policy.get("mode", "none")
        if mode == "byStaff":
            staff_to_hand = settings.get("staffToHandDefault", {"1": "RH", "2": "LH"})
            split_result = split_by_staff(score, part, staff_to_hand)
        elif mode == "none":
            split_result = HandSplitResult(None, None, "Hand split disabled")
    if split_result and split_result.rh_score and split_result.lh_score:
        rh_xml = tune_folder / f"{base_name}.rh.xml"
        lh_xml = tune_folder / f"{base_name}.lh.xml"
        _write_musicxml(split_result.rh_score, rh_xml)
        _write_musicxml(split_result.lh_score, lh_xml)
        rh_midi = tune_folder / f"{base_name}.rh.mid"
        lh_midi = tune_folder / f"{base_name}.lh.mid"
        write_midi(split_result.rh_score, rh_midi)
        write_midi(split_result.lh_score, lh_midi)
        note_sequences["rh"] = midi_to_note_sequence(rh_midi)
        note_sequences["lh"] = midi_to_note_sequence(lh_midi)
        full_total = note_sequences["full"]["totalTime"]
        note_sequences["rh"]["totalTime"] = full_total
        note_sequences["lh"]["totalTime"] = full_total
        tracks["rh"] = {
            "notesCount": len(note_sequences["rh"]["notes"]),
            "noteSequenceFile": f"{base_name}.rh.ns.json",
        }
        tracks["lh"] = {
            "notesCount": len(note_sequences["lh"]["notes"]),
            "noteSequenceFile": f"{base_name}.lh.ns.json",
        }
    write_json(tune_folder / f"{base_name}.ns.json", note_sequences["full"])
    if "rh" in note_sequences:
        write_json(tune_folder / f"{base_name}.rh.ns.json", note_sequences["rh"])
    if "lh" in note_sequences:
        write_json(tune_folder / f"{base_name}.lh.ns.json", note_sequences["lh"])
    resolved_payload: Optional[Dict[str, object]] = None
    if teacher:
        resolved_payload = resolve_nuggets(score, part, teacher["nuggets"], tracks, note_sequences)
        write_json(tune_folder / f"{base_name}.nuggets.resolved.v1.json", resolved_payload)
    summary = {
        "base": base_name,
        "tracks": tracks,
        "split": split_result.reason if split_result else "not requested",
        "resolved": bool(resolved_payload),
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Tune pipeline CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build", help="Build tune artifacts")
    build_parser.add_argument("tune_folder", type=Path)
    args = parser.parse_args()
    if args.command == "build":
        summary = build_tune(args.tune_folder)
        print("Build summary:")
        for key, value in summary.items():
            print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
