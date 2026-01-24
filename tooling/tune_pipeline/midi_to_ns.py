from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import pretty_midi


Note = Dict[str, float | int]


def _normalize_velocity(value: float) -> float:
    if value <= 1.0:
        normalized = value
    else:
        normalized = value / 127.0
    return max(0.0, min(1.0, normalized))


def midi_to_note_sequence(midi_path: Path) -> Dict[str, object]:
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    notes: List[Note] = []
    for instrument in pm.instruments:
        for note in instrument.notes:
            notes.append(
                {
                    "pitch": int(note.pitch),
                    "startTime": float(note.start),
                    "endTime": float(note.end),
                    "velocity": _normalize_velocity(float(note.velocity)),
                }
            )
    notes.sort(key=lambda n: (n["startTime"], n["pitch"], n["endTime"]))
    total_time = max((note["endTime"] for note in notes), default=0.0)
    return {
        "notes": notes,
        "tempos": [],
        "timeSignatures": [],
        "totalTime": float(total_time),
    }
