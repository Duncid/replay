from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .mxl_parse import ScoreEvent

EPS = 1e-6


@dataclass
class LocationSpan:
    measure_start: int
    beat_start: float
    measure_end: int
    beat_end: float


def _parse_location(location: Dict[str, Any]) -> LocationSpan:
    if "start" in location and "end" in location:
        start = location["start"]
        end = location["end"]
        return LocationSpan(
            measure_start=int(start["measure"]),
            beat_start=float(start.get("beat", 1.0)),
            measure_end=int(end["measure"]),
            beat_end=float(end.get("beat", 1.0)),
        )
    return LocationSpan(
        measure_start=int(location["measureStart"]),
        beat_start=float(location.get("beatStart", 1.0)),
        measure_end=int(location["measureEnd"]),
        beat_end=float(location.get("beatEnd", 1.0)),
    )


def _position_leq(a_measure: int, a_beat: float, b_measure: int, b_beat: float) -> bool:
    return (a_measure, a_beat) <= (b_measure, b_beat)


def _event_in_span(event: ScoreEvent, span: LocationSpan) -> bool:
    start_ok = _position_leq(span.measure_start, span.beat_start, event.measure, event.beat)
    end_ok = _position_leq(event.measure, event.beat, span.measure_end, span.beat_end)
    return start_ok and end_ok


def _expand_onset_group(notes: List[Dict[str, Any]], start: int, end: int) -> Tuple[int, int]:
    start_time = notes[start]["startTime"]
    while start > 0 and abs(notes[start - 1]["startTime"] - start_time) <= EPS:
        start -= 1
    end_time = notes[end]["startTime"]
    while end < len(notes) - 1 and abs(notes[end + 1]["startTime"] - end_time) <= EPS:
        end += 1
    return start, end


def _range_from_notes(notes: List[Dict[str, Any]], start: int, end: int) -> Dict[str, Any]:
    start, end = _expand_onset_group(notes, start, end)
    return {
        "noteStartIndex": start,
        "noteEndIndex": end,
        "startTime": float(notes[start]["startTime"]),
        "endTime": float(notes[end]["endTime"]),
    }


def _range_from_time_window(
    notes: List[Dict[str, Any]], start_time: float, end_time: float
) -> Optional[Dict[str, Any]]:
    indices = [
        idx
        for idx, note in enumerate(notes)
        if note["startTime"] >= start_time - EPS and note["startTime"] <= end_time + EPS
    ]
    if not indices:
        return None
    return _range_from_notes(notes, min(indices), max(indices))


def resolve_nuggets(
    teacher: Dict[str, Any],
    full_sequence: Dict[str, Any],
    score_matches: List[Optional[ScoreEvent]],
    rh_sequence: Optional[Dict[str, Any]],
    lh_sequence: Optional[Dict[str, Any]],
    source_files: Dict[str, str],
) -> Dict[str, Any]:
    nuggets_out: Dict[str, Any] = {}
    full_notes = full_sequence["notes"]
    for nugget in teacher["nuggets"]:
        nugget_id = nugget["id"]
        span = _parse_location(nugget["location"])
        matched_indices = [
            idx
            for idx, match in enumerate(score_matches)
            if match is not None and _event_in_span(match, span)
        ]
        if not matched_indices:
            raise ValueError(f"No matched notes for nugget {nugget_id}")
        full_range = _range_from_notes(full_notes, min(matched_indices), max(matched_indices))
        nugget_entry = {
            "label": nugget.get("label", ""),
            "ranges": {
                "full": full_range,
            },
        }
        start_time = full_range["startTime"]
        end_time = full_range["endTime"]
        if rh_sequence:
            rh_range = _range_from_time_window(rh_sequence["notes"], start_time, end_time)
            if rh_range:
                nugget_entry["ranges"]["rh"] = rh_range
        if lh_sequence:
            lh_range = _range_from_time_window(lh_sequence["notes"], start_time, end_time)
            if lh_range:
                nugget_entry["ranges"]["lh"] = lh_range
        nuggets_out[nugget_id] = nugget_entry

    return {
        "schemaVersion": "nuggets-resolved.v1",
        "source": source_files,
        "tracks": {
            "full": {
                "notesCount": len(full_notes),
                "noteSequenceFile": source_files["full"],
            },
            "rh": (
                {
                    "notesCount": len(rh_sequence["notes"]),
                    "noteSequenceFile": source_files["rh"],
                }
                if rh_sequence
                else {"notesCount": 0}
            ),
            "lh": (
                {
                    "notesCount": len(lh_sequence["notes"]),
                    "noteSequenceFile": source_files["lh"],
                }
                if lh_sequence
                else {"notesCount": 0}
            ),
        },
        "nuggets": nuggets_out,
        "pipelineSettings": teacher.get("pipelineSettings"),
    }
