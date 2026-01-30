from __future__ import annotations

import argparse
import copy
from pathlib import Path
from typing import Dict, Optional

from music21 import converter, instrument, stream, tempo, meter, note as m21note

from tune_pipeline.io import read_json, write_json
from tune_pipeline.midi_to_ns import midi_to_note_sequence
from tune_pipeline.nuggets_extract import extract_nuggets, extract_assemblies
from tune_pipeline.validate_teacher import validate_teacher
from tune_pipeline.xml_split_hands import HandSplitResult, split_by_staff
from tune_pipeline.xml_simplify import score_from_ns_for_dsp, simplify_part_for_dsp2
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
        import shutil
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

        # Combined Part (Always needed for 'full')
        combined_part = _combine_parts(raw_piano_parts)
        
        # Determine tracks to process
        parts_to_process = [("", combined_part)]
        parts_by_track: Dict[str, stream.Part] = {"full": combined_part}
        
        hand_policy = settings.get("handSplitPolicy", {})
        mode = hand_policy.get("mode", "none")
        split_info = "not requested"

        if mode == "byStaff":
            staff_to_hand = settings.get("staffToHandDefault", {"1": "RH", "2": "LH"})
            # Always use algorithmic split on the combined part
            split_result = split_by_staff(score, combined_part, staff_to_hand)
            
            if split_result.rh_score and split_result.lh_score:
                # Extract parts from the scores returned by split_result
                parts_to_process.append(("rh", split_result.rh_score.parts[0]))
                parts_to_process.append(("lh", split_result.lh_score.parts[0]))
                parts_by_track["rh"] = split_result.rh_score.parts[0]
                parts_by_track["lh"] = split_result.lh_score.parts[0]
                split_info = split_result.reason
            else:
                split_info = f"Split failed: {split_result.reason}"

        # 5. Process Output (MIDI -> NS)
        note_sequences: Dict[str, Dict[str, object]] = {}
        tracks: Dict[str, Dict[str, object]] = {}
        
        for suffix, part in parts_to_process:
            _process_track(output_dir, base_name, suffix, part, note_sequences, tracks)
            
        combined_part_for_nuggets = combined_part
        metadata = settings.get("metadata", {})

        # DSP XML (from NS)
        for track_name, ns in note_sequences.items():
            suffix = "" if track_name == "full" else f".{track_name}"
            dsp_score = score_from_ns_for_dsp(ns, metadata, grid)
            _write_musicxml(dsp_score, output_dir / f"dsp{suffix}.xml")

        # DSP2 XML (cleaned from XML)
        for track_name, part in parts_by_track.items():
            suffix = "" if track_name == "full" else f".{track_name}"
            chord_keep = "lowest" if track_name == "lh" else "highest"
            dsp2_part = simplify_part_for_dsp2(
                part,
                grid,
                chord_cap=chord_cap,
                chord_keep=chord_keep,
            )
            dsp2_score = stream.Score()
            dsp2_score.insert(0, dsp2_part)
            _write_musicxml(dsp2_score, output_dir / f"dsp2{suffix}.xml")

    elif tune_ns_candidates:
        # --- NS PATH ---
        print("XML missing, falling back to NS input...")
        
        # Identify source NS
        # Prefer 'tune.ns.json', then '{folder}.ns.json', then first found
        src_ns_path = tune_folder / "tune.ns.json"
        if not src_ns_path.exists():
            # Try folder name
            folder_ns = tune_folder / f"{tune_folder.name}.ns.json"
            if folder_ns.exists():
                src_ns_path = folder_ns
            else:
                src_ns_path = tune_ns_candidates[0]
        
        base_name = src_ns_path.stem.replace(".ns", "") 
        # base_name e.g. "intro" if file is "intro.ns.json"
        
        # Copy to output
        output_ns_path = output_dir / "tune.ns.json"
        source_ns_data = read_json(src_ns_path)
        write_json(output_ns_path, source_ns_data)
        
        note_sequences = {"full": source_ns_data}
        tracks = {
            "full": {
                "notesCount": len(source_ns_data.get("notes", [])),
                "noteSequenceFile": "tune.ns.json",
            }
        }
        split_info = "not applicable (NS source)"
        parts_by_track = {}
        
        # Build score from NS and use as XML input
        metadata = settings.get("metadata", {})
        
        if not metadata:
             print("Warning: No metadata in teacher.json for NS-derived score.")

        score = _score_from_note_sequence(source_ns_data, metadata)
        _write_musicxml(score, output_dir / "tune.xml")
        combined_part_for_nuggets = score.parts[0]
        parts_by_track = {"full": score.parts[0]}

        # DSP XML (from NS)
        dsp_score = score_from_ns_for_dsp(source_ns_data, metadata, grid)
        _write_musicxml(dsp_score, output_dir / "dsp.xml")

        # DSP2 XML (cleaned from XML)
        dsp2_part = simplify_part_for_dsp2(
            score.parts[0],
            grid,
            chord_cap=chord_cap,
            chord_keep="highest",
        )
        dsp2_score = stream.Score()
        dsp2_score.insert(0, dsp2_part)
        _write_musicxml(dsp2_score, output_dir / "dsp2.xml")
        
    else:
         raise PipelineError(f"Missing input file: expected tune.xml or *.ns.json in {tune_folder}")

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
