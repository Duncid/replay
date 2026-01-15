from __future__ import annotations

import argparse
import copy
from pathlib import Path
from typing import Dict, Optional

from music21 import converter, instrument, stream

from tune_pipeline.io import read_json, write_json
from tune_pipeline.midi_to_ns import midi_to_note_sequence
from tune_pipeline.mxl_unpack import unpack_mxl
from tune_pipeline.validate_teacher import validate_teacher
from tune_pipeline.xml_split_hands import HandSplitResult, split_by_staff
from tune_pipeline.xml_to_midi import write_midi


class PipelineError(RuntimeError):
    pass




def _set_staff_number(part: stream.Part, number: int) -> None:
    for element in part.recurse().notesAndRests:
        element.staffNumber = number


def _merge_part_into(base: stream.Part, other: stream.Part) -> None:
    # Iterate measures in other part
    for measure_other in other.getElementsByClass(stream.Measure):
        measure_base = base.measure(measure_other.number)
        if measure_base:
            for element in measure_other.elements:
                # Insert element into base measure at the same offset
                measure_base.insert(element.offset, element)
        else:
            # If measure doesn't exist in base (unlikely for matched parts), insert it
            base.insert(measure_other.offset, measure_other)


def _get_piano_parts(score: stream.Score) -> list[stream.Part]:
    piano_parts = []
    for part in score.parts:
        # Check instrument
        if part.getInstrument(returnDefault=False):
            inst = part.getInstrument(returnDefault=False)
            if isinstance(inst, instrument.Piano):
                piano_parts.append(part)
                continue
        # Check name
        part_name = (part.partName or "").lower()
        if "piano" in part_name:
            piano_parts.append(part)
            continue
    return piano_parts


def _combine_parts(parts: list[stream.Part]) -> stream.Part:
    if not parts:
        raise PipelineError("No piano parts found to combine")
    
    if len(parts) == 1:
        return parts[0]

    # Merge parts if multiple found (assuming P0=Staff1, P1=Staff2, etc)
    base_part = copy.deepcopy(parts[0])
    # If explicit staffNumber missing, assume 1 for first part
    _set_staff_number(base_part, 1)

    for i, part in enumerate(parts[1:]):
        # Determine staff number (2, 3...)
        staff_num = i + 2
        part_to_merge = copy.deepcopy(part)
        _set_staff_number(part_to_merge, staff_num)
        _merge_part_into(base_part, part_to_merge)
    
    return base_part


def _write_musicxml(score: stream.Score, path: Path) -> Path:
    score.write("musicxml", fp=str(path))
    return path


def _process_track(output_dir: Path, base_name: str, suffix: str, part: stream.Part, note_sequences: Dict[str, Dict[str, object]], tracks: Dict[str, Dict[str, object]]) -> None:
    # Create a temporary score for the part to write it
    score = stream.Score()
    score.insert(0, part)
    
    # Define filenames
    mid_name = f"{base_name}.{suffix}.mid" if suffix else f"{base_name}.mid"
    ns_name = f"{base_name}.{suffix}.ns.json" if suffix else f"{base_name}.ns.json"
    xml_name = f"{base_name}.{suffix}.xml" if suffix else f"{base_name}.xml" # Optional, mainly for RH/LH debugging
    
    if suffix:
         # Write XML for debugging/completeness for separated parts
        _write_musicxml(score, output_dir / xml_name)

    midi_path = output_dir / mid_name
    write_midi(score, midi_path)
    
    ns_key = suffix if suffix else "full"
    ns_data = midi_to_note_sequence(midi_path)
    
    # Ensure totalTime logic if needed? 
    # Usually full track dictates total time, but independent generation is safer for now unless specified.
    # The previous logic copied full_total to rh/lh. Let's stick to independent for now unless it causes issues, 
    # or copy if "full" exists.
    if "full" in note_sequences:
        ns_data["totalTime"] = note_sequences["full"]["totalTime"]
        
    note_sequences[ns_key] = ns_data
    tracks[ns_key] = {
        "notesCount": len(ns_data["notes"]),
        "noteSequenceFile": ns_name,
    }
    write_json(output_dir / ns_name, ns_data)


def build_tune(tune_folder: Path) -> Dict[str, object]:
    # 1. Inspection
    if not tune_folder.exists():
        raise PipelineError(f"Folder not found: {tune_folder}")
    
    teacher_path = tune_folder / "teacher.json"
    if not teacher_path.exists():
        raise PipelineError(f"Missing file: {teacher_path.name}")
    
    tune_mxl = tune_folder / "tune.mxl"
    if not tune_mxl.exists():
         raise PipelineError(f"Missing file: {tune_mxl.name}")

    teacher = read_json(teacher_path)
    # Validate teacher has pipelineSettings (and other basic checks)
    validate_teacher(teacher)
    
    # 2. Output Setup
    output_dir = tune_folder / "output"
    output_dir.mkdir(exist_ok=True)

    # 3. Unpack
    tune_xml = output_dir / "tune.xml"
    # Always unpack to ensure freshness? Or only if missing? 
    # User said "Unpack form tune.mxl", implying we should do it.
    unpack_mxl(tune_mxl, tune_xml)
    base_name = tune_xml.stem

    # 4. Parse & Split
    score = converter.parse(str(tune_xml))
    raw_piano_parts = _get_piano_parts(score)
    
    if not raw_piano_parts:
        # Fallback to first part if no piano detected
        raw_piano_parts = [score.parts[0]]

    # Combined Part (Always needed for 'full')
    combined_part = _combine_parts(raw_piano_parts)
    
    # Determine tracks to process
    # List of (suffix, part)
    # suffix="" means full/combined
    parts_to_process = [("", combined_part)]
    
    settings = teacher.get("pipelineSettings", {})
    hand_policy = settings.get("handSplitPolicy", {})
    mode = hand_policy.get("mode", "none")
    split_info = "not requested"

    if mode == "byStaff":
        staff_to_hand = settings.get("staffToHandDefault", {"1": "RH", "2": "LH"})
        # Always use algorithmic split on the combined part
        # This ensures consistent behavior regardless of whether source XML had 1 or 2 parts,
        # relying on _combine_parts to have correctly tagged staff numbers.
        split_result = split_by_staff(score, combined_part, staff_to_hand)
        
        if split_result.rh_score and split_result.lh_score:
            # Extract parts from the scores returned by split_result
            parts_to_process.append(("rh", split_result.rh_score.parts[0]))
            parts_to_process.append(("lh", split_result.lh_score.parts[0]))
            split_info = split_result.reason
        else:
            split_info = f"Split failed: {split_result.reason}"

    # 5. Process Output (MIDI -> NS)
    note_sequences: Dict[str, Dict[str, object]] = {}
    tracks: Dict[str, Dict[str, object]] = {}
    
    for suffix, part in parts_to_process:
        _process_track(output_dir, base_name, suffix, part, note_sequences, tracks)

    summary = {
        "base": base_name,
        "tracks": tracks,
        "split": split_info,
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
