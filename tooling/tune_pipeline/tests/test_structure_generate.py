from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
from music21 import instrument, note, stream

from tune_pipeline.cli import build_tune, write_teacher_json
from tune_pipeline.structure_generate import teaching_order_from_nuggets


def _two_measure_score() -> stream.Score:
    score = stream.Score()
    part = stream.Part()
    part.insert(0, instrument.Piano())
    measure1 = stream.Measure(number=1)
    n1 = note.Note("C4", quarterLength=1)
    n1.staffNumber = 1
    n2 = note.Note("E4", quarterLength=1)
    n2.staffNumber = 1
    measure1.append([n1, n2])
    measure2 = stream.Measure(number=2)
    n3 = note.Note("D4", quarterLength=1)
    n3.staffNumber = 1
    n4 = note.Note("F4", quarterLength=1)
    n4.staffNumber = 1
    measure2.append([n3, n4])
    part.append([measure1, measure2])
    score.insert(0, part)
    return score


def _inst_ns_measures_two_bars() -> dict:
    # 120 qpm, 4/4 -> 2s per measure; one note per beat in each measure
    return {
        "notes": [
            {"pitch": 60, "startTime": 0.0, "endTime": 0.5, "velocity": 0.8},
            {"pitch": 62, "startTime": 0.5, "endTime": 1.0, "velocity": 0.8},
            {"pitch": 64, "startTime": 1.0, "endTime": 1.5, "velocity": 0.8},
            {"pitch": 65, "startTime": 1.5, "endTime": 2.0, "velocity": 0.8},
            {"pitch": 67, "startTime": 2.0, "endTime": 2.5, "velocity": 0.8},
            {"pitch": 69, "startTime": 2.5, "endTime": 3.0, "velocity": 0.8},
            {"pitch": 71, "startTime": 3.0, "endTime": 3.5, "velocity": 0.8},
            {"pitch": 72, "startTime": 3.5, "endTime": 4.0, "velocity": 0.8},
        ],
        "totalTime": 4.0,
        "tempos": [{"time": 0.0, "qpm": 120}],
        "timeSignatures": [{"time": 0.0, "numerator": 4, "denominator": 4}],
    }


def test_teaching_order_is_dag_and_matches_nuggets() -> None:
    nuggets = [
        {
            "id": "N1",
            "location": {"startMeasure": 1, "startBeat": 1, "endMeasure": 2, "endBeat": 1},
            "dependsOn": [],
        },
        {
            "id": "N2",
            "location": {"startMeasure": 2, "startBeat": 1, "endMeasure": 3, "endBeat": 1},
            "dependsOn": ["N1"],
        },
    ]
    order = teaching_order_from_nuggets(nuggets)
    assert set(order) == {"N1", "N2"}
    assert order.index("N1") < order.index("N2")


def test_write_teacher_json_and_full_build(tmp_path: Path) -> None:
    tune_folder = tmp_path / "piece"
    tune_folder.mkdir()
    score = _two_measure_score()
    score.write("musicxml", fp=str(tune_folder / "tune.xml"))
    ns = _inst_ns_measures_two_bars()
    (tune_folder / "tune.inst1.ns.json").write_text(
        json.dumps(ns),
        encoding="utf-8",
    )
    lh = json.loads(json.dumps(ns))
    for n in lh["notes"]:
        n["pitch"] = int(n["pitch"]) - 12
    (tune_folder / "tune.inst2.ns.json").write_text(
        json.dumps(lh),
        encoding="utf-8",
    )

    payload = write_teacher_json(tune_folder)
    assert payload["schemaVersion"] == "teacher.v2"
    assert len(payload["nuggets"]) >= 2
    g = nx.DiGraph()
    for n in payload["nuggets"]:
        g.add_node(n["id"])
    for n in payload["nuggets"]:
        for dep in n.get("dependsOn") or []:
            g.add_edge(dep, n["id"])
    assert nx.is_directed_acyclic_graph(g)
    teaching = payload["teachingOrder"]
    assert len(teaching) == len(payload["nuggets"])
    assert set(teaching) == {n["id"] for n in payload["nuggets"]}

    summary = build_tune(tune_folder, no_generate=True)
    assert summary["base"] == "tune"
    out = tune_folder / "output"
    assert (out / "nuggets").exists()
    nugget_files = list((out / "nuggets").glob("*.ns.json"))
    assert len(nugget_files) >= 2
    assert (out / "assemblies").exists()
