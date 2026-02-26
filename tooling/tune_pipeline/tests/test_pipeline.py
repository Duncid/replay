from __future__ import annotations

import json
from pathlib import Path

from music21 import instrument, note, stream

from tune_pipeline.cli import build_tune


def _make_score() -> stream.Score:
    score = stream.Score()
    part = stream.Part()
    part.insert(0, instrument.Piano())
    measure1 = stream.Measure(number=1)
    n1 = note.Note("C4", quarterLength=1)
    n1.staffNumber = 1
    n2 = note.Note("E4", quarterLength=1)
    n2.staffNumber = 2
    measure1.append([n1, n2])
    measure2 = stream.Measure(number=2)
    n3 = note.Note("D4", quarterLength=1)
    n3.staffNumber = 1
    n4 = note.Note("F4", quarterLength=1)
    n4.staffNumber = 2
    measure2.append([n3, n4])
    part.append([measure1, measure2])
    score.insert(0, part)
    return score


def test_build_pipeline(tmp_path: Path) -> None:
    tune_folder = tmp_path / "gymnopdie"
    tune_folder.mkdir()
    score = _make_score()
    xml_path = tune_folder / "tune.xml"
    score.write("musicxml", fp=str(xml_path))
    teacher = {
        "schemaVersion": "nuggets-teacher.v1",
        "pipelineSettings": {
            "handAssignmentPolicy": {
                "mode": "byInstrument",
                "instrumentToHand": {"inst1": "RH", "inst2": "LH"},
            }
        },
        "nuggets": [
            {
                "id": "N1",
                "label": "Intro",
                "location": {"startMeasure": 1, "startBeat": 1, "endMeasure": 2, "endBeat": 1},
            }
        ],
        "assemblies": [
            {
                "id": "A1",
                "tier": 1,
                "nuggetIds": ["N1"],
            }
        ]
    }
    (tune_folder / "teacher.json").write_text(json.dumps(teacher), encoding="utf-8")
    (tune_folder / "tune.inst1.ns.json").write_text(
        json.dumps(
            {
                "notes": [{"pitch": 60, "startTime": 0.0, "endTime": 1.0, "velocity": 0.8}],
                "totalTime": 1.0,
                "tempos": [{"time": 0.0, "qpm": 120}],
                "timeSignatures": [{"time": 0.0, "numerator": 4, "denominator": 4}],
            }
        ),
        encoding="utf-8",
    )
    (tune_folder / "tune.inst2.ns.json").write_text(
        json.dumps(
            {
                "notes": [{"pitch": 48, "startTime": 0.0, "endTime": 1.0, "velocity": 0.7}],
                "totalTime": 1.0,
                "tempos": [{"time": 0.0, "qpm": 120}],
                "timeSignatures": [{"time": 0.0, "numerator": 4, "denominator": 4}],
            }
        ),
        encoding="utf-8",
    )

    summary = build_tune(tune_folder)
    output_dir = tune_folder / "output"

    assert summary["base"] == "tune"
    assert (output_dir / "tune.xml").exists()
    assert (output_dir / "tune.inst1.ns.json").exists()
    assert (output_dir / "tune.inst2.ns.json").exists()
    assert not (output_dir / "tune.ns.json").exists()
    assert not (output_dir / "tune.rh.ns.json").exists()
    assert not (output_dir / "tune.lh.ns.json").exists()
    assert (output_dir / "nuggets" / "N1.inst1.ns.json").exists()
    assert (output_dir / "nuggets" / "N1.inst2.ns.json").exists()
    assert (output_dir / "assemblies" / "A1.inst1.ns.json").exists()
    assert (output_dir / "assemblies" / "A1.inst2.ns.json").exists()
    assert not (output_dir / "nuggets" / "N1.ns.json").exists()
    assert not (output_dir / "assemblies" / "A1.ns.json").exists()
    notes = json.loads((output_dir / "tune.inst1.ns.json").read_text(encoding="utf-8"))["notes"]
    assert notes == sorted(notes, key=lambda n: (n["startTime"], n["pitch"], n["endTime"]))
