from __future__ import annotations

from typing import Any, Dict, List

import pretty_midi


def midi_to_note_sequence(midi_path: str, pipeline_settings: Dict[str, Any]) -> Dict[str, Any]:
    midi = pretty_midi.PrettyMIDI(midi_path)
    notes: List[Dict[str, Any]] = []
    for instrument in midi.instruments:
        for note in instrument.notes:
            notes.append(
                {
                    "pitch": int(note.pitch),
                    "startTime": float(note.start),
                    "endTime": float(note.end),
                    "velocity": float(note.velocity),
                }
            )
    notes.sort(key=lambda item: (item["startTime"], item["pitch"], item["endTime"]))
    total_time = max((note["endTime"] for note in notes), default=0.0)
    return {
        "notes": notes,
        "totalTime": float(total_time),
        "tempos": [],
        "timeSignatures": [],
        "metadata": {
            "instrument": pipeline_settings.get("instrument"),
            "pipelineSettings": pipeline_settings,
        },
    }


def midi_tempo_map(midi_path: str) -> List[tuple[float, float]]:
    midi = pretty_midi.PrettyMIDI(midi_path)
    times, tempi = midi.get_tempo_changes()
    if len(tempi) == 0:
        return []
    quarter_offsets = [0.0]
    cumulative_quarters = 0.0
    for idx in range(1, len(tempi)):
        delta_seconds = times[idx] - times[idx - 1]
        seconds_per_quarter = 60.0 / tempi[idx - 1]
        cumulative_quarters += delta_seconds / seconds_per_quarter
        quarter_offsets.append(cumulative_quarters)
    return list(zip(quarter_offsets, tempi.tolist()))
