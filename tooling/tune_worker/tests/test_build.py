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
