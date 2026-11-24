from pathlib import Path

import pytest

from tune_worker.build import BuildError, build_bundle_from_file, collect_bundle, _ns

ROOT = Path(__file__).resolve().parents[3]


def test_gymnopdie_bundle_preserves_both_tracks_in_every_section():
    bundle = collect_bundle(ROOT / "src/music/gymnopdie")
    notes = bundle["noteSequence"]["notes"]
    assert len(notes) == 455
    assert sum(note["instrument"] == 0 for note in notes) == 138
    assert sum(note["instrument"] == 1 for note in notes) == 317
    assert len(bundle["nuggets"]) == 127
    assert len(bundle["assemblies"]) == 45
    for kind in ("nuggets", "assemblies"):
        for item in bundle[kind]:
            import json
            files = (ROOT / "src/music/gymnopdie/output" / kind).glob(f'{item["id"]}.inst*.ns.json')
            expected = sum(len(json.loads(path.read_text())["notes"]) for path in files)
            assert len(item["noteSequence"]["notes"]) == expected > 0


def test_grouped_sequence_remains_authoritative(tmp_path):
    import json
    grouped = {"notes": [{"pitch": 60, "startTime": 0, "endTime": 1}], "totalTime": 1}
    (tmp_path / "tune.ns.json").write_text(json.dumps(grouped))
    (tmp_path / "tune.inst1.ns.json").write_text(json.dumps({"notes": []}))
    assert _ns(tmp_path, "tune") == grouped


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
