from __future__ import annotations

import json
import zipfile
from pathlib import Path

from music21 import converter, instrument, note, stream, tempo
import pretty_midi

from tune_pipeline.extract import extract_xml


def _write_mxl(xml_path: Path, mxl_path: Path) -> None:
    container = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n"
        "  <rootfiles>\n"
        f"    <rootfile full-path=\"{xml_path.name}\" media-type=\"application/vnd.recordare.musicxml+xml\"/>\n"
        "  </rootfiles>\n"
        "</container>\n"
    )
    with zipfile.ZipFile(mxl_path, "w") as zf:
        zf.writestr("META-INF/container.xml", container)
        zf.write(xml_path, arcname=xml_path.name)


def _make_score() -> stream.Score:
    score = stream.Score()
    part = stream.Part()
    part.insert(0, instrument.Piano())
    part.insert(0, tempo.MetronomeMark(number=120))
    measure = stream.Measure(number=1)
    ghost = note.Note("C4", quarterLength=0.01)
    ghost.staffNumber = 1
    normal = note.Note("D4", quarterLength=1)
    normal.staffNumber = 1
    measure.append([ghost, normal])
    part.append(measure)
    score.insert(0, part)
    return score


def _write_test_midi(midi_path: Path) -> None:
    midi = pretty_midi.PrettyMIDI()

    inst_1 = pretty_midi.Instrument(program=0, name="inst1")
    inst_1.notes.append(
        pretty_midi.Note(velocity=100, pitch=60, start=0.0, end=0.5)
    )
    inst_1.notes.append(
        pretty_midi.Note(velocity=96, pitch=62, start=0.5, end=1.0)
    )

    inst_2 = pretty_midi.Instrument(program=40, name="inst2")
    inst_2.notes.append(
        pretty_midi.Note(velocity=90, pitch=67, start=0.25, end=0.75)
    )

    midi.instruments.extend([inst_1, inst_2])
    midi.write(str(midi_path))


def test_extract_removes_ghost_notes(tmp_path: Path) -> None:
    tune_folder = tmp_path / "ghosts"
    tune_folder.mkdir()

    score = _make_score()
    xml_path = tune_folder / "tune.xml"
    score.write("musicxml", fp=str(xml_path))
    mxl_path = tune_folder / "tune.mxl"
    _write_mxl(xml_path, mxl_path)
    xml_path.unlink()

    cleaned_path = extract_xml(tune_folder)
    assert cleaned_path.exists()
    assert cleaned_path.name == "tune.xml"

    cleaned_score = converter.parse(str(cleaned_path))
    notes = list(cleaned_score.recurse().notes)
    assert len(notes) == 1
    assert notes[0].pitch.nameWithOctave == "D4"


def test_extract_writes_per_instrument_note_sequences(tmp_path: Path) -> None:
    tune_folder = tmp_path / "multi_inst"
    tune_folder.mkdir()

    score = _make_score()
    xml_path = tune_folder / "tune.xml"
    score.write("musicxml", fp=str(xml_path))
    mxl_path = tune_folder / "tune.mxl"
    _write_mxl(xml_path, mxl_path)
    xml_path.unlink()

    _write_test_midi(tune_folder / "tune.mid")

    cleaned_path = extract_xml(tune_folder)
    assert cleaned_path.exists()

    inst1_ns_path = tune_folder / "tune.inst1.ns.json"
    inst2_ns_path = tune_folder / "tune.inst2.ns.json"

    assert not (tune_folder / "tune.ns.json").exists()
    assert inst1_ns_path.exists()
    assert inst2_ns_path.exists()

    inst1_ns = json.loads(inst1_ns_path.read_text(encoding="utf-8"))
    inst2_ns = json.loads(inst2_ns_path.read_text(encoding="utf-8"))

    assert len(inst1_ns["notes"]) == 2
    assert len(inst2_ns["notes"]) == 1

    inst1_pitches = {note["pitch"] for note in inst1_ns["notes"]}
    inst2_pitches = {note["pitch"] for note in inst2_ns["notes"]}
    inst1_instruments = {note["instrument"] for note in inst1_ns["notes"]}
    inst2_instruments = {note["instrument"] for note in inst2_ns["notes"]}

    assert inst1_pitches == {60, 62}
    assert inst2_pitches == {67}
    assert inst1_instruments == {0}
    assert inst2_instruments == {1}
    assert all("program" in note for note in inst1_ns["notes"])
    assert all("isDrum" in note for note in inst2_ns["notes"])
