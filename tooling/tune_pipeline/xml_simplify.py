from __future__ import annotations

import copy
from typing import Dict, Iterable, Optional

from music21 import chord, instrument, key, meter, note, pitch, stream, tempo


def _quantize_value(value: float, grid: float) -> float:
    if grid <= 0:
        return value
    return round(value / grid) * grid


def _quantize_duration(duration: float, grid: float) -> float:
    if grid <= 0:
        return duration
    quantized = round(duration / grid) * grid
    if quantized <= 0:
        return grid
    return quantized


def _is_grace(element: stream.Music21Object) -> bool:
    duration = getattr(element, "duration", None)
    if duration is None:
        return False
    if getattr(duration, "isGrace", False):
        return True
    return float(getattr(duration, "quarterLength", 0.0)) <= 0.0


def _cap_chord_pitches(
    pitches: Iterable[note.Pitch],
    cap: Optional[int],
    keep: str,
) -> list[note.Pitch]:
    pitch_list = sorted(pitches, key=lambda p: p.midi)
    if cap is None or cap <= 0 or len(pitch_list) <= cap:
        return pitch_list
    if keep == "lowest":
        return pitch_list[:cap]
    return pitch_list[-cap:]


def _copy_part_headers(
    source: stream.Part, target: stream.Part, grid: float
) -> None:
    target.partName = source.partName
    inst = source.getInstrument(returnDefault=False)
    if inst is not None:
        target.insert(0.0, copy.deepcopy(inst))
    for cls in (tempo.MetronomeMark, meter.TimeSignature, key.KeySignature):
        for elem in source.recurse().getElementsByClass(cls):
            try:
                offset = float(elem.getOffsetBySite(source))
            except Exception:
                offset = float(elem.offset)
            target.insert(_quantize_value(offset, grid), copy.deepcopy(elem))

def _merge_overlapping_notes_only(part: stream.Part) -> None:
    overlap_eps = 1e-6
    by_pitch: dict[int, list[note.Note]] = {}
    for n in part.recurse().notes:
        if not isinstance(n, note.Note):
            continue
        by_pitch.setdefault(int(n.pitch.midi), []).append(n)

    for pitch_notes in by_pitch.values():
        pitch_notes.sort(key=lambda n: float(n.offset))
        current = None
        current_end = 0.0
        for n in pitch_notes:
            start = float(n.offset)
            end = float(n.offset + n.duration.quarterLength)
            if current is None:
                current = n
                current_end = end
                continue
            if start < current_end - overlap_eps:
                if end > current_end:
                    current.duration.quarterLength = max(
                        end - float(current.offset),
                    )
                    current_end = end
                part.remove(n, recurse=True)
            else:
                current = n
                current_end = end


def _spell_pitch_sharps(midi_value: int) -> pitch.Pitch:
    p = pitch.Pitch()
    p.midi = midi_value
    acc = getattr(p, "accidental", None)
    if acc is not None and getattr(acc, "alter", 0) < 0:
        enh = p.getEnharmonic()
        if enh is not None:
            return enh
    return p


def _build_pitch_only_part(
    events: list[list[int]],
    fixed_duration_ql: float,
    keep_chords: bool,
) -> stream.Part:
    part = stream.Part()
    part.insert(0, instrument.Piano())

    offset = 0.0
    for event in events:
        if not event:
            continue
        pitches = [_spell_pitch_sharps(m) for m in event]
        pitches = sorted(pitches, key=lambda p: p.midi)

        if len(pitches) == 1 or not keep_chords:
            n = note.Note(pitches[-1])
            n.duration.quarterLength = fixed_duration_ql
            part.insert(offset, n)
        else:
            c = chord.Chord(pitches)
            c.duration.quarterLength = fixed_duration_ql
            part.insert(offset, c)

        offset += fixed_duration_ql

    return part


def _events_from_ns(
    ns: Dict[str, object],
    grid: float,
) -> list[list[int]]:
    buckets: dict[float, list[int]] = {}
    for note_data in ns.get("notes", []):
        start_time = float(note_data.get("startTime", 0.0))
        pitch_value = int(note_data.get("pitch", 60))
        bucket_time = _quantize_value(start_time, grid)
        buckets.setdefault(bucket_time, []).append(pitch_value)
    return [buckets[key] for key in sorted(buckets.keys())]


def _events_from_part(
    part: stream.Part,
    grid: float,
) -> list[list[int]]:
    buckets: dict[float, list[int]] = {}
    for element in part.recurse().notes:
        if isinstance(element, note.Note):
            pitches = [int(element.pitch.midi)]
        elif isinstance(element, chord.Chord):
            pitches = [int(p.midi) for p in element.pitches]
        else:
            continue
        offset = _quantize_value(float(element.offset), grid)
        buckets.setdefault(offset, []).extend(pitches)
    return [buckets[key] for key in sorted(buckets.keys())]


def quantize_part(
    part: stream.Part,
    grid: float,
    chord_cap: Optional[int] = None,
    chord_keep: str = "highest",
) -> stream.Part:
    new_part = stream.Part()
    _copy_part_headers(part, new_part, grid)

    for element in part.flat.notesAndRests:
        if _is_grace(element):
            continue
        offset = _quantize_value(float(element.offset), grid)
        duration = _quantize_duration(float(element.duration.quarterLength), grid)

        if isinstance(element, chord.Chord):
            pitches = _cap_chord_pitches(element.pitches, chord_cap, chord_keep)
            if not pitches:
                continue
            new_elem = chord.Chord(pitches)
        elif isinstance(element, note.Note):
            new_elem = note.Note(element.pitch)
        elif isinstance(element, note.Rest):
            new_elem = note.Rest()
        else:
            continue

        new_elem.duration.quarterLength = duration
        new_part.insert(offset, new_elem)

    _merge_overlapping_notes_only(new_part)
    return new_part


def score_from_ns_for_dsp(
    ns: Dict[str, object],
    metadata: Dict[str, object],
    grid: float,
) -> stream.Score:
    events = _events_from_ns(ns, grid)
    quantized_part = _build_pitch_only_part(
        events,
        fixed_duration_ql=1.0,
        keep_chords=True,
    )
    score = stream.Score()
    score.insert(0, quantized_part)
    # Avoid makeMeasures to prevent ties being reintroduced at barlines.
    return score


def simplify_part_for_dsp2(
    part: stream.Part,
    grid: float,
    chord_cap: Optional[int],
    chord_keep: str,
) -> stream.Part:
    temp_score = stream.Score()
    temp_score.insert(0, copy.deepcopy(part))
    try:
        temp_score = temp_score.expandRepeats()
    except Exception:
        pass
    part_copy = temp_score.parts[0]
    try:
        part_copy.stripTies(inPlace=True)
    except Exception:
        pass
    cleaned_part = quantize_part(
        part_copy,
        grid,
        chord_cap=chord_cap,
        chord_keep=chord_keep,
    )
    events = _events_from_part(cleaned_part, grid)
    return _build_pitch_only_part(
        events,
        fixed_duration_ql=1.0,
        keep_chords=True,
    )


def simplify_score_for_dsp2(
    score: stream.Score,
    grid: float,
    chord_cap: Optional[int],
    chord_keep: str,
) -> stream.Score:
    try:
        score = score.expandRepeats()
    except Exception:
        pass
    try:
        score.stripTies(inPlace=True)
    except Exception:
        pass

    new_score = stream.Score()
    for part in score.parts:
        new_part = simplify_part_for_dsp2(part, grid, chord_cap, chord_keep)
        new_score.insert(0, new_part)
    # Avoid makeMeasures to prevent ties being reintroduced at barlines.
    return new_score
