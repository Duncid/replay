from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import pretty_midi


Note = Dict[str, float | int]


def _normalize_velocity(value: float) -> float:
    if value <= 1.0:
        normalized = value
    else:
        normalized = value / 127.0
    return max(0.0, min(1.0, normalized))


def _note_to_payload(note: pretty_midi.Note, instrument_index: int, program: int, is_drum: bool) -> Note:
    return {
        "instrument": int(instrument_index),
        "program": int(program),
        "pitch": int(note.pitch),
        "startTime": float(note.start),
        "endTime": float(note.end),
        "velocity": _normalize_velocity(float(note.velocity)),
        "isDrum": bool(is_drum),
    }


def _empty_sequence() -> Dict[str, object]:
    return {
        "timeSignatures": [],
        "keySignatures": [],
        "tempos": [],
        "notes": [],
        "pitchBends": [],
        "controlChanges": [],
        "partInfos": [],
        "textAnnotations": [],
        "sectionAnnotations": [],
        "sectionGroups": [],
        "ticksPerQuarter": 220,
        "sourceInfo": {"encodingType": "MIDI", "parser": "PRETTY_MIDI"},
        "totalTime": 0.0,
    }


def _sort_sequence(sequence: Dict[str, object]) -> None:
    notes = sequence["notes"]
    notes.sort(
        key=lambda n: (
            n["startTime"],
            n["instrument"],
            n["pitch"],
            n["endTime"],
        )
    )
    sequence["pitchBends"].sort(
        key=lambda bend: (bend["time"], bend["instrument"], bend["pitchBend"])
    )
    sequence["controlChanges"].sort(
        key=lambda cc: (cc["time"], cc["instrument"], cc["controlNumber"], cc["controlValue"])
    )
    sequence["timeSignatures"].sort(
        key=lambda ts: (ts["time"], ts["numerator"], ts["denominator"])
    )
    sequence["keySignatures"].sort(key=lambda ks: (ks["time"], ks["key"]))
    sequence["tempos"].sort(key=lambda tempo: (tempo["time"], tempo["qpm"]))
    sequence["totalTime"] = float(max((note["endTime"] for note in notes), default=0.0))


def _add_global_metadata(pm: pretty_midi.PrettyMIDI, sequence: Dict[str, object]) -> None:
    times, bpms = pm.get_tempo_changes()
    sequence["tempos"] = [
        {"time": float(time), "qpm": float(qpm)} for time, qpm in zip(times, bpms)
    ]
    sequence["timeSignatures"] = [
        {
            "time": float(ts.time),
            "numerator": int(ts.numerator),
            "denominator": int(ts.denominator),
        }
        for ts in pm.time_signature_changes
    ]
    sequence["keySignatures"] = [
        {"time": float(ks.time), "key": int(ks.key_number)}
        for ks in pm.key_signature_changes
    ]
    sequence["ticksPerQuarter"] = int(pm.resolution)


def _instrument_sequences(pm: pretty_midi.PrettyMIDI) -> List[Dict[str, object]]:
    sequences: List[Dict[str, object]] = []
    for instrument_index, instrument in enumerate(pm.instruments):
        sequence = _empty_sequence()
        _add_global_metadata(pm, sequence)

        sequence["notes"] = [
            _note_to_payload(
                note,
                instrument_index=instrument_index,
                program=instrument.program,
                is_drum=instrument.is_drum,
            )
            for note in instrument.notes
        ]
        sequence["pitchBends"] = [
            {
                "time": float(bend.time),
                "pitchBend": int(bend.pitch),
                "instrument": int(instrument_index),
                "program": int(instrument.program),
                "isDrum": bool(instrument.is_drum),
            }
            for bend in instrument.pitch_bends
        ]
        sequence["controlChanges"] = [
            {
                "time": float(cc.time),
                "controlNumber": int(cc.number),
                "controlValue": int(cc.value),
                "instrument": int(instrument_index),
                "program": int(instrument.program),
                "isDrum": bool(instrument.is_drum),
            }
            for cc in instrument.control_changes
        ]

        _sort_sequence(sequence)
        sequences.append(sequence)
    return sequences


def _merge_sequences(sequences: List[Dict[str, object]]) -> Dict[str, object]:
    merged = _empty_sequence()
    if not sequences:
        return merged

    merged["timeSignatures"] = list(sequences[0]["timeSignatures"])
    merged["keySignatures"] = list(sequences[0]["keySignatures"])
    merged["tempos"] = list(sequences[0]["tempos"])
    merged["ticksPerQuarter"] = int(sequences[0]["ticksPerQuarter"])
    merged["sourceInfo"] = dict(sequences[0]["sourceInfo"])

    for sequence in sequences:
        merged["notes"].extend(sequence["notes"])
        merged["pitchBends"].extend(sequence["pitchBends"])
        merged["controlChanges"].extend(sequence["controlChanges"])

    _sort_sequence(merged)
    return merged


def midi_to_note_sequences_with_instruments(
    midi_path: Path,
) -> Tuple[Dict[str, object], List[Dict[str, object]]]:
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    per_instrument_sequences = _instrument_sequences(pm)
    full_sequence = _merge_sequences(per_instrument_sequences)

    return full_sequence, per_instrument_sequences


def midi_to_note_sequence(midi_path: Path) -> Dict[str, object]:
    full_sequence, _ = midi_to_note_sequences_with_instruments(midi_path)
    return full_sequence
