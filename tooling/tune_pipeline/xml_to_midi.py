from __future__ import annotations

from pathlib import Path

from music21 import stream


class MidiWriteError(RuntimeError):
    pass


def write_midi(score: stream.Score, midi_path: Path) -> Path:
    try:
        score.write("midi", fp=str(midi_path))
    except Exception as exc:  # pragma: no cover - music21 uses many exception types
        raise MidiWriteError(f"Failed to write MIDI to {midi_path}") from exc
    return midi_path
