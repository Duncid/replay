from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from music21 import converter, instrument, tempo


@dataclass(frozen=True)
class ScoreEvent:
    pitch: int
    measure: int
    beat: float
    staff: int
    offset_quarters: float
    onset_seconds: float


DEFAULT_BPM = 120.0


def _pick_part(score, expects_two_staves: bool):
    for part in score.parts:
        if any(isinstance(inst, instrument.Piano) for inst in part.getInstruments()):
            return part
    if expects_two_staves:
        for part in score.parts:
            if part.partName and "piano" in part.partName.lower():
                return part
    return score.parts[0]


def _tempo_mark_boundaries(score) -> List[tuple[float, float]]:
    boundaries = []
    # metronomeMarkBoundaries returns (start, end, mark)
    for start, _, mark in score.metronomeMarkBoundaries():
        if isinstance(mark, tempo.MetronomeMark):
            bpm = mark.number or DEFAULT_BPM
            boundaries.append((float(start), float(bpm)))
    return boundaries


def _seconds_from_offset(offset_quarters: float, tempo_map: List[tuple[float, float]]) -> float:
    if not tempo_map:
        return offset_quarters * (60.0 / DEFAULT_BPM)
    tempo_map = sorted(tempo_map, key=lambda item: item[0])
    total_seconds = 0.0
    prev_offset = 0.0
    prev_bpm = tempo_map[0][1]
    for change_offset, bpm in tempo_map[1:]:
        if offset_quarters <= change_offset:
            break
        total_seconds += (change_offset - prev_offset) * (60.0 / prev_bpm)
        prev_offset = change_offset
        prev_bpm = bpm
    total_seconds += (offset_quarters - prev_offset) * (60.0 / prev_bpm)
    return total_seconds


def parse_score_events(
    musicxml_path: str,
    pipeline_settings: Dict[str, Any],
    midi_tempos: Optional[List[tuple[float, float]]] = None,
) -> List[ScoreEvent]:
    score = converter.parse(musicxml_path)
    part = _pick_part(score, pipeline_settings.get("expectsTwoStaves", False))
    if midi_tempos:
        tempo_map = midi_tempos
    else:
        tempo_map = _tempo_mark_boundaries(score)

    events: List[ScoreEvent] = []
    for measure in part.getElementsByClass("Measure"):
        measure_number = int(measure.number)
        for element in measure.recurse().notes:
            staff = int(getattr(element, "staff", 1) or 1)
            beat = float(getattr(element, "beat", 1.0) or 1.0)
            offset_quarters = float(element.getOffsetInHierarchy(part))
            onset_seconds = _seconds_from_offset(offset_quarters, tempo_map)
            if element.isChord:
                for pitch in element.pitches:
                    events.append(
                        ScoreEvent(
                            pitch=int(pitch.midi),
                            measure=measure_number,
                            beat=beat,
                            staff=staff,
                            offset_quarters=offset_quarters,
                            onset_seconds=onset_seconds,
                        )
                    )
            else:
                events.append(
                    ScoreEvent(
                        pitch=int(element.pitch.midi),
                        measure=measure_number,
                        beat=beat,
                        staff=staff,
                        offset_quarters=offset_quarters,
                        onset_seconds=onset_seconds,
                    )
                )
    events.sort(key=lambda ev: (ev.offset_quarters, ev.pitch, ev.onset_seconds))
    return events
