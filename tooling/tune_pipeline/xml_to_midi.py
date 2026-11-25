from __future__ import annotations

import copy
from pathlib import Path

from music21 import stream


class MidiWriteError(RuntimeError):
    pass


def drop_grace_notes(score: stream.Score) -> stream.Score:
    """Return a copy without grace notes.

    music21 writes zero-length grace notes with their note-off before their
    note-on, so MIDI readers leave that pitch sounding until a later note-off
    (e.g. a 77-second C6 in Chopin's Waltz in A minor). Grace notes are
    ornaments the practice highway cannot judge, so they are omitted.
    """
    cleaned = copy.deepcopy(score)
    graces = [n for n in cleaned.recurse().notes if n.duration.isGrace]
    for n in graces:
        site = n.activeSite
        if site is not None:
            site.remove(n)
    return cleaned


def write_midi(score: stream.Score, midi_path: Path) -> Path:
    try:
        drop_grace_notes(score).write("midi", fp=str(midi_path))
    except Exception as exc:  # pragma: no cover - music21 uses many exception types
        raise MidiWriteError(f"Failed to write MIDI to {midi_path}") from exc
    return midi_path
