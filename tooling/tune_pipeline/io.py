import json
from pathlib import Path
from typing import Any, Dict, Tuple


class PipelineError(Exception):
    pass


def read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        raise PipelineError(f"Failed to read JSON: {path}") from exc


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def find_inputs(folder: Path) -> Tuple[Path, Path, Path, str]:
    if not folder.exists():
        raise PipelineError(f"Folder does not exist: {folder}")
    midi_files = sorted(folder.glob("*.mid"))
    if len(midi_files) != 1:
        raise PipelineError("Expected exactly one .mid file in tune folder")
    midi_path = midi_files[0]
    stem = midi_path.stem
    xml_path = folder / f"{stem}.xml"
    mxl_path = folder / f"{stem}.mxl"
    musicxml_path = xml_path if xml_path.exists() else mxl_path
    if not musicxml_path.exists():
        raise PipelineError("Missing tune.xml or tune.mxl matching MIDI base name")
    teacher_path = folder / "teacher.json"
    if not teacher_path.exists():
        raise PipelineError("Missing teacher.json")
    return midi_path, musicxml_path, teacher_path, stem


def validate_teacher(teacher: Dict[str, Any]) -> None:
    if teacher.get("schemaVersion") != "nuggets-teacher.v1":
        raise PipelineError("teacher.json schemaVersion must be nuggets-teacher.v1")
    if "pipelineSettings" not in teacher:
        raise PipelineError("teacher.json missing pipelineSettings")
    nuggets = teacher.get("nuggets")
    if not isinstance(nuggets, list) or not nuggets:
        raise PipelineError("teacher.json must include non-empty nuggets list")
    for nugget in nuggets:
        if "id" not in nugget:
            raise PipelineError("nugget missing id")
        if "location" not in nugget:
            raise PipelineError("nugget missing location")


def load_teacher(path: Path) -> Dict[str, Any]:
    teacher = read_json(path)
    validate_teacher(teacher)
    return teacher
