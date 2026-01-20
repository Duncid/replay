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
            "handSplitPolicy": {"mode": "byStaff"},
            "staffToHandDefault": {"1": "RH", "2": "LH"},
        },
        "nuggets": [
            {
                "id": "N1",
                "label": "Intro",
                "location": {"startMeasure": 1, "startBeat": 1, "endMeasure": 2, "endBeat": 1},
            }
        ],
    }
    (tune_folder / "teacher.json").write_text(json.dumps(teacher), encoding="utf-8")

    summary = build_tune(tune_folder)

    assert summary["base"] == "tune"
    assert (tune_folder / "tune.xml").exists()
    assert (tune_folder / "tune.mid").exists()
    assert (tune_folder / "tune.ns.json").exists()
    assert (tune_folder / "tune.rh.ns.json").exists()
    assert (tune_folder / "tune.lh.ns.json").exists()
    resolved_path = tune_folder / "tune.nuggets.resolved.v1.json"
    assert resolved_path.exists()
    resolved = json.loads(resolved_path.read_text(encoding="utf-8"))
    assert "N1" in resolved["nuggets"]
    notes = json.loads((tune_folder / "tune.ns.json").read_text(encoding="utf-8"))["notes"]
    assert notes == sorted(notes, key=lambda n: (n["startTime"], n["pitch"], n["endTime"]))
