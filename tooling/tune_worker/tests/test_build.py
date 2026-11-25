from pathlib import Path

import pytest

from tune_worker.build import BuildError, build_bundle_from_file, collect_bundle, _ns, extract_composer

ROOT = Path(__file__).resolve().parents[3]


def test_extracts_chopin_as_composer_not_arranger():
    score = '<score-partwise><identification><creator type="composer">Frédéric Chopin</creator><creator type="arranger">Someone Else</creator></identification></score-partwise>'
    assert extract_composer(score) == "Frédéric Chopin"


def test_extracts_satie_without_lifespan():
    assert extract_composer((ROOT / "src/music/gymnopdie/tune.xml").read_text()) == "Erik Satie"


@pytest.mark.parametrize("score", [None, "bad xml", '<score-partwise/>', '<score-partwise><identification><creator type="composer">Music21</creator></identification></score-partwise>'])
def test_missing_or_placeholder_composer_stays_unknown(score):
    assert extract_composer(score) is None


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
    assert bundle["composer"] == "Erik Satie"
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


def test_grace_notes_do_not_leave_hanging_notes(tmp_path):
    from music21 import converter, note, stream
    import pretty_midi
    from tune_pipeline.xml_to_midi import write_midi

    part = stream.Part()
    grace = note.Note("C6").getGrace()
    part.append([note.Note("C6", quarterLength=1), grace, note.Note("C6", quarterLength=1), note.Note("D6", quarterLength=4)])
    score = stream.Score([part])
    midi_path = write_midi(score, tmp_path / "t.mid")
    notes = pretty_midi.PrettyMIDI(str(midi_path)).instruments[0].notes
    assert max(n.end - n.start for n in notes) <= 2.0 + 1e-6
    assert len(notes) == 3


def test_st_louis_blues_has_no_hanging_notes(tmp_path):
    # The score holds zero-length notes without a grace mark; they used to leave
    # chord tones sounding for up to 104 seconds.
    from music21 import converter
    from tune_pipeline.xml_to_midi import write_midi
    from tune_pipeline.midi_to_ns import midi_to_note_sequence
    midi_path = write_midi(converter.parse(str(ROOT / "src/music/st-louis-blues/tune.mxl")), tmp_path / "s.mid")
    notes = midi_to_note_sequence(midi_path)["notes"]
    assert max(n["endTime"] - n["startTime"] for n in notes) <= 5.0


def test_same_pitch_overlap_is_clipped():
    from tune_pipeline.midi_to_ns import _clip_overlapping_same_pitch
    notes = [{"pitch": 84, "startTime": 0.0, "endTime": 77.0}, {"pitch": 84, "startTime": 1.5, "endTime": 2.0}, {"pitch": 60, "startTime": 0.5, "endTime": 3.0}]
    out = _clip_overlapping_same_pitch(notes)
    assert out[0]["endTime"] == 1.5 and out[2]["endTime"] == 3.0
