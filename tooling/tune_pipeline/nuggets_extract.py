from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from music21 import stream, tempo, meter, key, instrument
from pydantic import BaseModel

import copy

from tune_pipeline.xml_simplify import score_from_ns_for_dsp, simplify_part_for_dsp2

class NuggetExtractError(RuntimeError):
    pass


def _global_offset(element: stream.Music21Object, parent: stream.Stream) -> float:
    try:
        return float(element.getOffsetBySite(parent))
    except Exception:
        return float(element.offset)


def _last_element_before(
    part: stream.Part,
    cls: type,
    offset: float
) -> Optional[stream.Music21Object]:
    last_elem = None
    last_offset = None
    for elem in part.recurse().getElementsByClass(cls):
        elem_offset = _global_offset(elem, part)
        if elem_offset < offset and (last_offset is None or elem_offset > last_offset):
            last_elem = elem
            last_offset = elem_offset
    return last_elem


def _slice_part_by_offset(
    part: stream.Part,
    start_offset: float,
    end_offset: float
) -> stream.Part:
    sliced_part = stream.Part()
    sliced_part.partName = "Piano"
    sliced_part.insert(0.0, instrument.Piano())

    # Preserve relevant context at the slice start
    for cls in (tempo.MetronomeMark, meter.TimeSignature, key.KeySignature):
        last_elem = _last_element_before(part, cls, start_offset)
        if last_elem is not None:
            sliced_part.insert(0.0, copy.deepcopy(last_elem))
        for elem in part.recurse().getElementsByClass(cls):
            elem_offset = _global_offset(elem, part)
            if start_offset <= elem_offset < end_offset:
                sliced_part.insert(elem_offset - start_offset, copy.deepcopy(elem))

    next_measure_number = 1
    for measure in part.getElementsByClass(stream.Measure):
        measure_offset = _global_offset(measure, part)
        measure_end = measure_offset + measure.duration.quarterLength
        if measure_end <= start_offset or measure_offset >= end_offset:
            continue

        new_measure = stream.Measure(number=next_measure_number)
        new_measure.duration = measure.duration
        next_measure_number += 1

        for elem in measure.elements:
            elem_global_offset = measure_offset + elem.offset
            if start_offset <= elem_global_offset < end_offset:
                if isinstance(elem, instrument.Instrument):
                    continue
                if "Lyric" in getattr(elem, "classes", []):
                    continue
                new_elem = copy.deepcopy(elem)
                if hasattr(new_elem, "lyrics"):
                    new_elem.lyrics = []
                if hasattr(new_elem, "lyric"):
                    new_elem.lyric = None
                new_measure.insert(elem.offset, new_elem)

        sliced_part.insert(measure_offset - start_offset, new_measure)

    return sliced_part


def _write_musicxml(part: stream.Part, path: Path) -> Path:
    score = stream.Score()
    score.insert(0, part)
    score.write("musicxml", fp=str(path))
    return path


def _tempo_boundaries(score: stream.Score) -> List[Tuple[float, Optional[float], float]]:
    boundaries = score.metronomeMarkBoundaries()
    if not boundaries:
        return [(0.0, None, 120.0)]
    output: List[Tuple[float, Optional[float], float]] = []
    for start, end, mark in boundaries:
        tempo = getattr(mark, "number", None) or 120.0
        output.append((float(start), float(end) if end is not None else None, float(tempo)))
    return output


def _tempos_for_slice(
    score: stream.Score,
    boundaries: List[Tuple[float, Optional[float], float]],
    start_offset: float,
    end_offset: float
) -> List[Dict[str, float]]:
    marks: List[Tuple[float, float]] = []
    for mark in score.recurse().getElementsByClass(tempo.MetronomeMark):
        offset = _global_offset(mark, score)
        qpm = getattr(mark, "number", None) or 120.0
        marks.append((float(offset), float(qpm)))
    if not marks:
        marks = [(0.0, 120.0)]
    marks.sort(key=lambda item: item[0])

    last_before = None
    in_range: List[Tuple[float, float]] = []
    for offset, qpm in marks:
        if offset < start_offset:
            last_before = (offset, qpm)
            continue
        if start_offset <= offset < end_offset:
            in_range.append((offset, qpm))

    selected: List[Tuple[float, float]] = []
    if last_before is not None:
        selected.append(last_before)
    selected.extend(in_range)
    if not selected:
        selected = [(start_offset, 120.0)]

    start_seconds = _offset_to_seconds(start_offset, boundaries)
    tempos = []
    for offset, qpm in selected:
        t = _offset_to_seconds(offset, boundaries) - start_seconds
        tempos.append({"time": float(max(0.0, t)), "qpm": float(qpm)})
    return tempos


def _time_signatures_for_slice(
    part: stream.Part,
    boundaries: List[Tuple[float, Optional[float], float]],
    start_offset: float,
    end_offset: float
) -> List[Dict[str, float]]:
    signatures: List[Tuple[float, int, int]] = []
    for ts in part.recurse().getElementsByClass(meter.TimeSignature):
        offset = _global_offset(ts, part)
        signatures.append((float(offset), int(ts.numerator), int(ts.denominator)))
    if not signatures:
        signatures = [(0.0, 4, 4)]
    signatures.sort(key=lambda item: item[0])

    last_before = None
    in_range: List[Tuple[float, int, int]] = []
    for offset, numerator, denominator in signatures:
        if offset < start_offset:
            last_before = (offset, numerator, denominator)
            continue
        if start_offset <= offset < end_offset:
            in_range.append((offset, numerator, denominator))

    selected: List[Tuple[float, int, int]] = []
    if last_before is not None:
        selected.append(last_before)
    selected.extend(in_range)
    if not selected:
        selected = [(start_offset, 4, 4)]

    start_seconds = _offset_to_seconds(start_offset, boundaries)
    time_signatures = []
    for offset, numerator, denominator in selected:
        t = _offset_to_seconds(offset, boundaries) - start_seconds
        time_signatures.append(
            {
                "time": float(max(0.0, t)),
                "numerator": int(numerator),
                "denominator": int(denominator),
            }
        )
    return time_signatures


def _measure_offset(part: stream.Part, measure_number: int, beat: float) -> float:
    # music21 measure() can return a Stream if multiple measures match, or None
    # We want the specific measure object at that number.
    measure = part.measure(measure_number)
    if measure is None:
        raise NuggetExtractError(f"Measure {measure_number} not found")
    
    # If using measure(number), it might return the measure itself (if unique) 
    # or a stream containing it? usually it returns the measure object if unique.
    # But if there are multiple parts merged, measure() on the PART should be fine.
    
    # Get time signature from measure or part
    # We need to recurse if not found immediately
    time_sig = measure.timeSignature
    if not time_sig:
        time_sig = part.recurse().getElementsByClass("TimeSignature").first()
    
    beat_length = time_sig.beatDuration.quarterLength if time_sig else 1.0
    
    # Calculate offset
    # measure.offset is global offset
    return float(measure.offset + (beat - 1.0) * beat_length)


def _offset_to_seconds(offset: float, boundaries: List[Tuple[float, Optional[float], float]]) -> float:
    seconds = 0.0
    remaining = offset
    for start, end, tempo in boundaries:
        if remaining <= 0:
            break
        # Calculate duration of this tempo segment in quarter lengths
        segment_duration = (end if end is not None else start + remaining + 1000) - start
        
        # How much of our 'remaining' offset falls into this segment?
        # We need to locate 'offset' relative to 'start'.
        # Actually logic is: calculate time from 0 to 'offset'.
        
        # Simpler logic:
        # Iterate segments.
        # Overlap = overlap between [0, offset] and [start, end]
        current_segment_end = end if end is not None else float("inf")
        
        # Overlap interval
        seg_start = start
        seg_end = min(current_segment_end, offset)
        
        if seg_end > seg_start:
            quarter_length = seg_end - seg_start
            seconds += quarter_length * (60.0 / tempo)
            
    return seconds


def extract_nuggets(
    score: stream.Score,
    combined_part: stream.Part,
    output_dir: Path,
    nuggets: List[Dict[str, Any]],
    note_sequences: Dict[str, Dict[str, Any]],
    parts_by_track: Optional[Dict[str, stream.Part]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    grid: float = 0.25,
    chord_cap: Optional[int] = None,
) -> None:
    boundaries = _tempo_boundaries(score)
    parts_by_track = parts_by_track or {}
    metadata = metadata or {}
    
    # Create nuggets directory
    nuggets_dir = output_dir / "nuggets"
    nuggets_dir.mkdir(parents=True, exist_ok=True)
    
    for nugget in nuggets:
        if "location" not in nugget or "id" not in nugget:
            continue
            
        nugget_id = str(nugget["id"])
        loc = nugget["location"]
        
        start_m = loc.get("startMeasure") or loc["start"]["measure"]
        start_b = loc.get("startBeat", 1) if "startBeat" in loc else loc["start"].get("beat", 1)
        
        end_m = loc.get("endMeasure") or loc["end"]["measure"]
        end_b = loc.get("endBeat", 1) if "endBeat" in loc else loc["end"].get("beat", 1)

        try:
            start_offset = _measure_offset(combined_part, int(start_m), float(start_b))
            end_offset = _measure_offset(combined_part, int(end_m), float(end_b))
            
            start_seconds = _offset_to_seconds(start_offset, boundaries)
            end_seconds = _offset_to_seconds(end_offset, boundaries)
            
        except Exception as e:
            print(f"Skipping nugget {nugget_id}: {e}")
            continue
            
        # Extract for each track
        for track_name, ns in note_sequences.items():
            # Determine filename suffix
            # full -> nX.ns.json
            # rh -> nX.rh.ns.json
            suffix = "" if track_name == "full" else f".{track_name}"
            filename = f"{nugget_id}{suffix}.ns.json"
            
            # Slice notes
            sliced_notes = []
            for note in ns["notes"]:
                # Check intersection or containment
                # Simple logic: Note starts within window? 
                # Or Note overlaps window?
                # Usually we want notes *belonging* to this section.
                # "Starts within" is safest for melody. "Overlaps" can catch tails of previous chords.
                # Let's use: Starts >= start_seconds AND Starts < end_seconds
                if start_seconds <= note["startTime"] < end_seconds:
                    new_note = copy.deepcopy(note)
                    # Shift to 0
                    new_note["startTime"] -= start_seconds
                    new_note["endTime"] -= start_seconds
                    sliced_notes.append(new_note)
            
            # Create extracted NS
            # Duration should cover last note end if notes extend beyond slice window.
            total_duration = end_seconds - start_seconds
            if sliced_notes:
                max_note_end = max(note["endTime"] for note in sliced_notes)
                if max_note_end > total_duration:
                    total_duration = max_note_end
            
            tempos = _tempos_for_slice(score, boundaries, start_offset, end_offset)
            time_signatures = _time_signatures_for_slice(combined_part, boundaries, start_offset, end_offset)

            import json
            extracted_ns = {
                "notes": sliced_notes,
                "totalTime": total_duration,
                "tempos": tempos,
                "timeSignatures": time_signatures
            }
            
            with open(nuggets_dir / filename, 'w') as f:
                json.dump(extracted_ns, f, indent=2)

            dsp_score = score_from_ns_for_dsp(extracted_ns, metadata, grid)
            dsp_filename = f"{nugget_id}{suffix}.dsp.xml"
            _write_musicxml(dsp_score.parts[0], nuggets_dir / dsp_filename)

            part = parts_by_track.get(track_name)
            if part is not None:
                sliced_part = _slice_part_by_offset(part, start_offset, end_offset)
                xml_filename = f"{nugget_id}{suffix}.xml"
                _write_musicxml(sliced_part, nuggets_dir / xml_filename)

                chord_keep = "lowest" if track_name == "lh" else "highest"
                dsp2_part = simplify_part_for_dsp2(
                    sliced_part,
                    grid,
                    chord_cap=chord_cap,
                    chord_keep=chord_keep,
                )
                dsp2_filename = f"{nugget_id}{suffix}.dsp2.xml"
                _write_musicxml(dsp2_part, nuggets_dir / dsp2_filename)


def extract_assemblies(
    score: stream.Score,
    combined_part: stream.Part,
    output_dir: Path,
    assemblies: List[Dict[str, Any]],
    nuggets: List[Dict[str, Any]],
    note_sequences: Dict[str, Dict[str, Any]],
    parts_by_track: Optional[Dict[str, stream.Part]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    grid: float = 0.25,
    chord_cap: Optional[int] = None,
) -> None:
    """Extract assemblies by combining nugget ranges.
    
    For each assembly, find the start of the first nugget and end of the last nugget,
    then extract notes from that range.
    """
    boundaries = _tempo_boundaries(score)
    parts_by_track = parts_by_track or {}
    metadata = metadata or {}
    
    # Create assemblies directory
    assemblies_dir = output_dir / "assemblies"
    assemblies_dir.mkdir(parents=True, exist_ok=True)
    
    # Build nugget lookup by id
    nugget_by_id: Dict[str, Dict[str, Any]] = {n["id"]: n for n in nuggets if "id" in n}
    
    for assembly in assemblies:
        if "id" not in assembly or "nuggetIds" not in assembly:
            continue
            
        assembly_id = str(assembly["id"])
        nugget_ids = assembly["nuggetIds"]
        
        if not nugget_ids:
            print(f"Skipping assembly {assembly_id}: no nuggetIds")
            continue
        
        # Collect locations from referenced nuggets
        locations = []
        for nid in nugget_ids:
            nugget = nugget_by_id.get(nid)
            if not nugget or "location" not in nugget:
                print(f"Warning: nugget {nid} not found for assembly {assembly_id}")
                continue
            locations.append((nid, nugget["location"]))
        
        if not locations:
            print(f"Skipping assembly {assembly_id}: no valid nugget locations")
            continue
        
        # Find start of first nugget and end of last nugget
        # Sort by (startMeasure, startBeat) to find first and last
        def get_start(loc: Dict[str, Any]) -> Tuple[int, float]:
            start_m = loc.get("startMeasure") or loc.get("start", {}).get("measure", 1)
            start_b = loc.get("startBeat", 1) if "startBeat" in loc else loc.get("start", {}).get("beat", 1)
            return (int(start_m), float(start_b))
        
        def get_end(loc: Dict[str, Any]) -> Tuple[int, float]:
            end_m = loc.get("endMeasure") or loc.get("end", {}).get("measure", 1)
            end_b = loc.get("endBeat", 1) if "endBeat" in loc else loc.get("end", {}).get("beat", 1)
            return (int(end_m), float(end_b))
        
        # Sort locations by start position
        sorted_locs = sorted(locations, key=lambda x: get_start(x[1]))
        first_loc = sorted_locs[0][1]
        
        # Sort by end position to find last
        sorted_by_end = sorted(locations, key=lambda x: get_end(x[1]))
        last_loc = sorted_by_end[-1][1]
        
        start_m, start_b = get_start(first_loc)
        end_m, end_b = get_end(last_loc)
        
        try:
            start_offset = _measure_offset(combined_part, start_m, start_b)
            end_offset = _measure_offset(combined_part, end_m, end_b)
            
            start_seconds = _offset_to_seconds(start_offset, boundaries)
            end_seconds = _offset_to_seconds(end_offset, boundaries)
            
        except Exception as e:
            print(f"Skipping assembly {assembly_id}: {e}")
            continue
        
        # Extract for each track
        for track_name, ns in note_sequences.items():
            suffix = "" if track_name == "full" else f".{track_name}"
            filename = f"{assembly_id}{suffix}.ns.json"
            
            # Slice notes
            sliced_notes = []
            for note in ns["notes"]:
                if start_seconds <= note["startTime"] < end_seconds:
                    new_note = copy.deepcopy(note)
                    new_note["startTime"] -= start_seconds
                    new_note["endTime"] -= start_seconds
                    sliced_notes.append(new_note)
            
            total_duration = end_seconds - start_seconds
            if sliced_notes:
                max_note_end = max(note["endTime"] for note in sliced_notes)
                if max_note_end > total_duration:
                    total_duration = max_note_end
            
            tempos = _tempos_for_slice(score, boundaries, start_offset, end_offset)
            time_signatures = _time_signatures_for_slice(combined_part, boundaries, start_offset, end_offset)

            import json
            extracted_ns = {
                "notes": sliced_notes,
                "totalTime": total_duration,
                "tempos": tempos,
                "timeSignatures": time_signatures
            }
            
            with open(assemblies_dir / filename, 'w') as f:
                json.dump(extracted_ns, f, indent=2)

            dsp_score = score_from_ns_for_dsp(extracted_ns, metadata, grid)
            dsp_filename = f"{assembly_id}{suffix}.dsp.xml"
            _write_musicxml(dsp_score.parts[0], assemblies_dir / dsp_filename)

            part = parts_by_track.get(track_name)
            if part is not None:
                sliced_part = _slice_part_by_offset(part, start_offset, end_offset)
                xml_filename = f"{assembly_id}{suffix}.xml"
                _write_musicxml(sliced_part, assemblies_dir / xml_filename)

                chord_keep = "lowest" if track_name == "lh" else "highest"
                dsp2_part = simplify_part_for_dsp2(
                    sliced_part,
                    grid,
                    chord_cap=chord_cap,
                    chord_keep=chord_keep,
                )
                dsp2_filename = f"{assembly_id}{suffix}.dsp2.xml"
                _write_musicxml(dsp2_part, assemblies_dir / dsp2_filename)
        
        print(f"Extracted assembly {assembly_id}: {len(sliced_notes)} notes, {total_duration:.2f}s")
