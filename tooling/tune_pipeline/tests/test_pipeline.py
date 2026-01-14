from __future__ import annotations

import json
from pathlib import Path
import sys

import pretty_midi
from music21 import instrument, meter, note, stream, tempo

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tune_pipeline.cli import build


def _write_midi(path: Path) -> None:
    midi = pretty_midi.PrettyMIDI(initial_tempo=120.0)
    inst = pretty_midi.Instrument(program=0)
    inst.notes.append(pretty_midi.Note(velocity=90, pitch=60, start=0.0, end=0.5))
    inst.notes.append(pretty_midi.Note(velocity=90, pitch=52, start=1.0, end=1.5))
    midi.instruments.append(inst)
    midi.write(str(path))


def _write_musicxml(path: Path) -> None:
    score = stream.Score()
    part = stream.Part()
    part.insert(0, instrument.Piano())
    measure = stream.Measure(number=1)
    measure.append(meter.TimeSignature("4/4"))
    note_one = note.Note("C4", quarterLength=1)
    note_one.staff = 1
    measure.append(note_one)
    note_two = note.Note("E3", quarterLength=1)
    note_two.offset = 2
    note_two.staff = 2
    measure.append(note_two)
    part.append(measure)
    score.append(part)
    score.insert(0, tempo.MetronomeMark(number=120))
    score.write("musicxml", fp=str(path))


def _write_teacher(path: Path) -> None:
    teacher = {
        "schemaVersion": "nuggets-teacher.v1",
        "pipelineSettings": {
            "instrument": "piano",
            "expectsTwoStaves": True,
            "staffToHandDefault": {"1": "RH", "2": "LH"},
            "handSplitPolicy": {"mode": "byStaff", "crossStaffHandling": "discourage"},
            "alignmentPolicy": {"noteMatching": "strict", "fallbackIfLowConfidence": "pitchSplit"},
            "nuggetSlicingPolicy": {
                "preferMeasureBoundaries": True,
                "targetDurationSeconds": [2.0, 6.0],
                "targetNotesPerNugget": [4, 12],
                "maxDurationSeconds": 8.0,
            },
        },
        "nuggets": [
            {
                "id": "N1",
                "label": "Opening",
                "location": {
                    "measureStart": 1,
                    "beatStart": 1,
                    "measureEnd": 1,
                    "beatEnd": 3,
                },
            }
        ],
    }
    path.write_text(json.dumps(teacher))


def test_pipeline_outputs(tmp_path: Path) -> None:
    midi_path = tmp_path / "tune.mid"
    xml_path = tmp_path / "tune.xml"
    teacher_path = tmp_path / "teacher.json"
    _write_midi(midi_path)
    _write_musicxml(xml_path)
    _write_teacher(teacher_path)

    build(tmp_path)

    ns_path = tmp_path / "tune.ns.json"
    hands_path = tmp_path / "tune.hands.map.json"
    nuggets_path = tmp_path / "tune.nuggets.resolved.v1.json"
    assert ns_path.exists()
    assert hands_path.exists()
    assert nuggets_path.exists()

    note_sequence = json.loads(ns_path.read_text())
    notes = note_sequence["notes"]
    assert notes == sorted(notes, key=lambda item: (item["startTime"], item["pitch"], item["endTime"]))

    hands_map = json.loads(hands_path.read_text())
    assert len(hands_map["notes"]) == len(notes)

    resolved = json.loads(nuggets_path.read_text())
    assert "N1" in resolved["nuggets"]
    ranges = resolved["nuggets"]["N1"]["ranges"]["full"]
    assert 0 <= ranges["noteStartIndex"] <= ranges["noteEndIndex"] < len(notes)
    assert notes[ranges["noteStartIndex"]]["startTime"] == ranges["startTime"]
    assert notes[ranges["noteEndIndex"]]["endTime"] == ranges["endTime"]
