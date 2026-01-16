from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from music21 import stream
from pydantic import BaseModel

import copy


class NuggetExtractError(RuntimeError):
    pass


def _tempo_boundaries(score: stream.Score) -> List[Tuple[float, Optional[float], float]]:
    boundaries = score.metronomeMarkBoundaries()
    if not boundaries:
        return [(0.0, None, 120.0)]
    output: List[Tuple[float, Optional[float], float]] = []
    for start, end, mark in boundaries:
        tempo = getattr(mark, "number", None) or 120.0
        output.append((float(start), float(end) if end is not None else None, float(tempo)))
    return output


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
    note_sequences: Dict[str, Dict[str, Any]]
) -> None:
    boundaries = _tempo_boundaries(score)
    
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
            # Duration is window duration
            total_duration = end_seconds - start_seconds
            
            import json
            extracted_ns = {
                "notes": sliced_notes,
                "totalTime": total_duration,
                "tempos": [], # Could extract relevant tempos, but simple for now
                "timeSignatures": []
            }
            
            with open(nuggets_dir / filename, 'w') as f:
                json.dump(extracted_ns, f, indent=2)
