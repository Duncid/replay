from __future__ import annotations

import zipfile
from pathlib import Path

from music21 import converter, instrument, note, stream, tempo

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
    assert cleaned_path.name == "tune.cleaned.xml"

    cleaned_score = converter.parse(str(cleaned_path))
    notes = list(cleaned_score.recurse().notes)
    assert len(notes) == 1
    assert notes[0].pitch.nameWithOctave == "D4"
