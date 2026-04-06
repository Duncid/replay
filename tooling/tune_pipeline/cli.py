from __future__ import annotations

import argparse
import copy
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Optional

from music21 import converter, instrument, stream, tempo, meter, note as m21note

from tune_pipeline.io import read_json, write_json
from tune_pipeline.nuggets_extract import extract_nuggets, extract_assemblies
from tune_pipeline.validate_teacher import validate_teacher


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


def _build_piano_score(
    source_score: stream.Score, piano_parts: list[stream.Part]
) -> stream.Score:
    piano_score = stream.Score()
    if source_score.metadata:
        piano_score.metadata = copy.deepcopy(source_score.metadata)
    for part in piano_parts:
        piano_score.insert(0, copy.deepcopy(part))
    return piano_score


def _strip_lyrics(score: stream.Score) -> None:
    for element in score.recurse().notes:
        element.lyrics = []
        element.lyric = None


def _strip_lyrics_from_xml(path: Path) -> None:
    tree = ET.parse(path)
    root = tree.getroot()
    for parent in root.iter():
        for child in list(parent):
            if child.tag.endswith("lyric"):
                parent.remove(child)
    tree.write(path, encoding="utf-8", xml_declaration=True)


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


def _load_instrument_note_sequences(tune_folder: Path) -> Dict[str, Dict[str, object]]:
    note_sequences: Dict[str, Dict[str, object]] = {}
    inst_paths = sorted(
        tune_folder.glob("tune.inst*.ns.json"),
        key=lambda path: int(path.stem.split(".inst")[-1].split(".ns")[0]),
    )
    for path in inst_paths:
        key = path.stem.split(".")[-2]
        note_sequences[key] = read_json(path)

    # Backward-compatible fallback for single-track folders.
    if not note_sequences:
        fallback_path = tune_folder / "tune.ns.json"
        if fallback_path.exists():
            note_sequences["inst1"] = read_json(fallback_path)
    return note_sequences


def _write_instrument_note_sequences(
    output_dir: Path,
    note_sequences: Dict[str, Dict[str, object]],
) -> Dict[str, Dict[str, object]]:
    tracks: Dict[str, Dict[str, object]] = {}
    for inst_key, ns_data in note_sequences.items():
        ns_name = f"tune.{inst_key}.ns.json"
        write_json(output_dir / ns_name, ns_data)
        tracks[inst_key] = {
            "notesCount": len(ns_data.get("notes", [])),
            "noteSequenceFile": ns_name,
        }
    return tracks





def _create_skeleton_score(metadata: Dict[str, object]) -> stream.Score:
    """Creates a minimal score with time/tempo info for nugget extraction."""
    from music21 import meter, tempo, note as m21note
    
    score = stream.Score()
    part = stream.Part()
    score.insert(0, part)
    
    # Tempo
    qpm = metadata.get("assumedTempoQpm", 120)
    part.insert(0, tempo.MetronomeMark(number=qpm))
    
    # Time Signature
    ts_str = metadata.get("assumedTimeSignature", "4/4")
    ts = meter.TimeSignature(ts_str)
    part.insert(0, ts)
    
    # Calculate measure duration in quarter lengths
    ts_parts = ts_str.split("/")
    beats_per_measure = int(ts_parts[0])
    beat_type = int(ts_parts[1])
    measure_duration = beats_per_measure * (4 / beat_type)
    
    # Measures - we need enough to cover the nuggets
    num_measures = metadata.get("assumedMeasuresFromTotalTime", 100)
    
    # Create measures with proper duration (filled with rests)
    # This ensures music21 calculates correct offsets for each measure
    for m_num in range(1, num_measures + 1):
        m = stream.Measure(number=m_num)
        r = m21note.Rest()
        r.quarterLength = measure_duration
        m.append(r)
        part.append(m)
    
    return score


def _score_from_note_sequence(ns: Dict[str, object], metadata: Dict[str, object]) -> stream.Score:
    score = stream.Score()
    part = stream.Part()
    part.insert(0, instrument.Piano())
    score.insert(0, part)

    tempos = list(ns.get("tempos", []) or [])
    time_signatures = list(ns.get("timeSignatures", []) or [])

    default_qpm = metadata.get("assumedTempoQpm", 120)
    default_ts = metadata.get("assumedTimeSignature", "4/4")

    if not tempos:
        tempos = [{"time": 0.0, "qpm": float(default_qpm)}]
    tempos = sorted(tempos, key=lambda t: t.get("time", 0.0))
    if tempos[0].get("time", 0.0) > 0:
        tempos.insert(0, {"time": 0.0, "qpm": float(default_qpm)})

    def seconds_to_ql(seconds: float) -> float:
        ql = 0.0
        prev_time = 0.0
        current_qpm = float(tempos[0].get("qpm", default_qpm))
        for entry in tempos[1:]:
            change_time = float(entry.get("time", 0.0))
            if seconds <= change_time:
                break
            ql += (change_time - prev_time) * (current_qpm / 60.0)
            prev_time = change_time
            current_qpm = float(entry.get("qpm", current_qpm))
        ql += (seconds - prev_time) * (current_qpm / 60.0)
        return ql

    for entry in tempos:
        t = float(entry.get("time", 0.0))
        qpm = float(entry.get("qpm", default_qpm))
        part.insert(seconds_to_ql(t), tempo.MetronomeMark(number=qpm))

    if not time_signatures:
        time_signatures = [{"time": 0.0, "numerator": int(default_ts.split("/")[0]), "denominator": int(default_ts.split("/")[1])}]
    time_signatures = sorted(time_signatures, key=lambda t: t.get("time", 0.0))
    if time_signatures[0].get("time", 0.0) > 0:
        time_signatures.insert(0, {"time": 0.0, "numerator": int(default_ts.split("/")[0]), "denominator": int(default_ts.split("/")[1])})

    for entry in time_signatures:
        t = float(entry.get("time", 0.0))
        numerator = int(entry.get("numerator", default_ts.split("/")[0]))
        denominator = int(entry.get("denominator", default_ts.split("/")[1]))
        part.insert(seconds_to_ql(t), meter.TimeSignature(f"{numerator}/{denominator}"))

    for note_data in ns.get("notes", []):
        start_time = float(note_data.get("startTime", 0.0))
        end_time = float(note_data.get("endTime", start_time))
        if end_time <= start_time:
            continue
        start_ql = seconds_to_ql(start_time)
        end_ql = seconds_to_ql(end_time)
        duration_ql = max(0.0, end_ql - start_ql)
        n = m21note.Note(int(note_data.get("pitch", 60)))
        n.duration.quarterLength = duration_ql
        velocity = float(note_data.get("velocity", 0.5))
        n.volume.velocity = int(round(max(0.0, min(1.0, velocity)) * 127))
        part.insert(start_ql, n)

    score.makeMeasures(inPlace=True)
    return score

def build_tune(tune_folder: Path) -> Dict[str, object]:
    # 1. Inspection
    if not tune_folder.exists():
        raise PipelineError(f"Folder not found: {tune_folder}")
    
    teacher_path = tune_folder / "teacher.json"
    if not teacher_path.exists():
        raise PipelineError(f"Missing file: {teacher_path.name}")
    
    teacher = read_json(teacher_path)
    validate_teacher(teacher)

    # 2. Output Setup - clean and recreate
    output_dir = tune_folder / "output"
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(exist_ok=True)
    
    # Check inputs
    tune_xml = tune_folder / "tune.xml"
    tune_ns_candidates = list(tune_folder.glob("*.ns.json"))
    
    settings = teacher.get("pipelineSettings", {})
    dsp_settings = settings.get("dsp", {})
    grid = float(dsp_settings.get("gridQuarterLength", 0.25))
    chord_cap_value = dsp_settings.get("chordCap", 6)
    chord_cap = int(chord_cap_value) if chord_cap_value is not None else None
    note_sequences = _load_instrument_note_sequences(tune_folder)
    if not note_sequences:
        raise PipelineError(
            "Missing NoteSequence input: expected tune.inst*.ns.json or fallback tune.ns.json"
        )
    tracks = _write_instrument_note_sequences(output_dir, note_sequences)
    split_info = "instrument tracks"

    # Priority: XML -> NS
    if tune_xml.exists():
        # --- XML PATH ---
        base_name = tune_xml.stem

        # 3. Parse & Split
        score = converter.parse(str(tune_xml))
        raw_piano_parts = _get_piano_parts(score)
        
        if not raw_piano_parts:
            # Fallback to first part if no piano detected
            raw_piano_parts = [score.parts[0]]

        # Persist a simplified tune.xml containing only piano parts
        piano_score = _build_piano_score(score, raw_piano_parts)
        _strip_lyrics(piano_score)
        tune_xml_out = output_dir / "tune.xml"
        _write_musicxml(piano_score, tune_xml_out)
        _strip_lyrics_from_xml(tune_xml_out)

        # Combined Part is used only for timeline offsets during chunk extraction.
        combined_part = _combine_parts(raw_piano_parts)
        combined_part_for_nuggets = combined_part
        metadata = settings.get("metadata", {})
        parts_by_track: Dict[str, stream.Part] = {}

    elif tune_ns_candidates:
        # --- NS PATH ---
        print("XML missing, falling back to instrument NoteSequence input...")
        base_name = "tune"
        parts_by_track = {}

        # Build score from first instrument NS and use as XML input.
        metadata = settings.get("metadata", {})
        if not metadata:
             print("Warning: No metadata in teacher.json for NS-derived score.")
        primary_key = sorted(note_sequences.keys())[0]
        score = _score_from_note_sequence(note_sequences[primary_key], metadata)
        _write_musicxml(score, output_dir / "tune.xml")
        combined_part_for_nuggets = score.parts[0]
    else:
         raise PipelineError(
             f"Missing input file: expected tune.xml, tune.inst*.ns.json, or tune.ns.json in {tune_folder}"
         )

    # 6. Nugget Extraction
    if teacher and "nuggets" in teacher:
        extract_nuggets(
            score,
            combined_part_for_nuggets,
            output_dir,
            teacher["nuggets"],
            note_sequences,
            parts_by_track=parts_by_track,
            metadata=settings.get("metadata", {}),
            grid=grid,
            chord_cap=chord_cap,
        )
    
    # 7. Assembly Extraction
    if teacher and "assemblies" in teacher and "nuggets" in teacher:
        extract_assemblies(
            score,
            combined_part_for_nuggets,
            output_dir,
            teacher["assemblies"],
            teacher["nuggets"],
            note_sequences,
            parts_by_track=parts_by_track,
            metadata=settings.get("metadata", {}),
            grid=grid,
            chord_cap=chord_cap,
        )

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
