from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from music21 import stream

EPS = 1e-6


@dataclass
class NuggetRange:
    note_start_index: int
    note_end_index: int
    start_time: float
    end_time: float


class NuggetResolveError(RuntimeError):
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


def offset_to_seconds(offset: float, boundaries: List[Tuple[float, Optional[float], float]]) -> float:
    seconds = 0.0
    remaining = offset
    for start, end, tempo in boundaries:
        if remaining <= 0:
            break
        segment_end = end if end is not None else start + remaining
        segment_length = min(remaining, segment_end - start)
        seconds += segment_length * (60.0 / tempo)
        remaining -= segment_length
    return seconds


def _measure_offset(part: stream.Part, measure_number: int, beat: float) -> float:
    measure = part.measure(measure_number)
    if measure is None:
        raise NuggetResolveError(f"Measure {measure_number} not found")
    time_sig = measure.timeSignature or part.recurse().getElementsByClass("TimeSignature").first()
    beat_length = time_sig.beatDuration.quarterLength if time_sig else 1.0
    return float(measure.offset + (beat - 1) * beat_length)


def _parse_location(location: Dict[str, object]) -> Tuple[float, float, float, float]:
    if "start" in location and "end" in location:
        start = location["start"]
        end = location["end"]
        return (
            float(start["measure"]),
            float(start.get("beat", 1)),
            float(end["measure"]),
            float(end.get("beat", 1)),
        )
    return (
        float(location.get("startMeasure")),
        float(location.get("startBeat", 1)),
        float(location.get("endMeasure")),
        float(location.get("endBeat", 1)),
    )


def _select_notes(notes: List[Dict[str, float]], start: float, end: float) -> Optional[NuggetRange]:
    indices = [idx for idx, note in enumerate(notes) if start <= note["startTime"] < end]
    if not indices:
        return None
    start_idx = indices[0]
    end_idx = indices[-1]
    start_time = notes[start_idx]["startTime"]
    end_onset = notes[end_idx]["startTime"]
    while start_idx > 0 and abs(notes[start_idx - 1]["startTime"] - start_time) <= EPS:
        start_idx -= 1
    while end_idx + 1 < len(notes) and abs(notes[end_idx + 1]["startTime"] - end_onset) <= EPS:
        end_idx += 1
    end_time = max(note["endTime"] for note in notes if abs(note["startTime"] - end_onset) <= EPS)
    return NuggetRange(start_idx, end_idx, float(notes[start_idx]["startTime"]), float(end_time))


def resolve_nuggets(
    score: stream.Score,
    part: stream.Part,
    nuggets: Iterable[Dict[str, object]],
    tracks: Dict[str, Dict[str, object]],
    note_sequences: Dict[str, Dict[str, object]],
) -> Dict[str, object]:
    boundaries = _tempo_boundaries(score)
    resolved: Dict[str, object] = {}
    for nugget in nuggets:
        nugget_id = str(nugget["id"])
        location = nugget["location"]
        start_measure, start_beat, end_measure, end_beat = _parse_location(location)
        start_offset = _measure_offset(part, int(start_measure), start_beat)
        end_offset = _measure_offset(part, int(end_measure), end_beat)
        start_time = offset_to_seconds(start_offset, boundaries)
        end_time = offset_to_seconds(end_offset, boundaries)
        ranges: Dict[str, object] = {}
        for track_name, seq in note_sequences.items():
            notes = seq["notes"]
            nugget_range = _select_notes(notes, start_time, end_time)
            if nugget_range is None:
                if track_name == "full":
                    raise NuggetResolveError(f"Nugget {nugget_id} resolved to zero notes")
                continue
            ranges[track_name] = {
                "noteStartIndex": nugget_range.note_start_index,
                "noteEndIndex": nugget_range.note_end_index,
                "startTime": nugget_range.start_time,
                "endTime": nugget_range.end_time,
            }
        resolved[nugget_id] = {
            "label": nugget.get("label"),
            "ranges": ranges,
        }
    return {
        "schemaVersion": "nuggets-resolved.v1",
        "source": {
            "teacher": "teacher.json",
            "full": tracks["full"]["noteSequenceFile"],
            "rh": tracks.get("rh", {}).get("noteSequenceFile"),
            "lh": tracks.get("lh", {}).get("noteSequenceFile"),
        },
        "tracks": tracks,
        "nuggets": resolved,
    }
