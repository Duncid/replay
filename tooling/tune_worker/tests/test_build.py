from pathlib import Path

import pytest

from tune_worker.build import BuildError, build_bundle_from_file

ROOT = Path(__file__).resolve().parents[3]


def test_uploaded_mxl_builds_nuggets_and_assemblies():
    bundle = build_bundle_from_file(ROOT / "src/music/gymnopdie/tune.mxl", "Gymnopedie")
    assert bundle["briefing"]["title"] == "Gymnopedie"
    assert bundle["noteSequence"]["notes"]
    assert len(bundle["nuggets"]) > 0 and any((n.get("noteSequence") or {}).get("notes") for n in bundle["nuggets"])
    assert len(bundle["assemblies"]) > 0
    assert bundle["tuneXml"]


def test_uploaded_xml_matches_local_nugget_ids():
    bundle = build_bundle_from_file(ROOT / "src/music/st-louis-blues/tune.xml")
    local = sorted(p.name.split(".")[0] for p in (ROOT / "src/music/st-louis-blues/output/nuggets").glob("*.xml") if ".dsp" not in p.name)
    assert sorted(n["id"] for n in bundle["nuggets"]) == local


def test_midi_is_rejected():
    with pytest.raises(BuildError):
        build_bundle_from_file(ROOT / "src/music/st-louis-blues/tune.mid")


def test_analysis_input_lists_measures_and_instrument_notes():
    from tune_worker.build import analysis_input
    a = analysis_input(ROOT / "src/music/st-louis-blues/tune.xml")
    assert a["measures"][0]["measure"] >= 0 and a["measures"][0]["beats"] > 0
    assert a["instruments"] and len(a["instruments"][0]["notes"][0]) == 3


def test_supplied_teacher_plan_replaces_heuristic():
    import json
    teacher = json.loads((ROOT / "src/music/st-louis-blues/teacher.json").read_text())
    teacher["nuggets"] = teacher["nuggets"][:2]
    teacher["assemblies"] = []
    bundle = build_bundle_from_file(ROOT / "src/music/st-louis-blues/tune.xml", teacher=teacher)
    assert [n["id"] for n in bundle["nuggets"]] == [n["id"] for n in teacher["nuggets"]]
