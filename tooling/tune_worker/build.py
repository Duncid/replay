"""Build a publishable tune bundle from one uploaded score.

Thin wrapper around ``tune_pipeline``: it lays out a temporary tune folder the
same way the local workflow does (score + instrument NoteSequences), calls the
unchanged ``build_tune`` and reads ``output/`` back into the JSON bundle shape
the app's ``tune-publish`` function expects.
"""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from music21 import converter

from tune_pipeline.cli import build_tune
from tune_pipeline.midi_to_ns import midi_to_note_sequences_with_instruments
from tune_pipeline.mxl_unpack import unpack_mxl
from tune_pipeline.xml_to_midi import write_midi

# MIDI-only input is not offered: the pipeline's NoteSequence fallback cannot
# export very short durations to MusicXML yet.
SUPPORTED = {".mxl", ".xml", ".musicxml"}


class BuildError(RuntimeError):
    pass


def _read_json(path: Path) -> Optional[Any]:
    return json.loads(path.read_text()) if path.exists() else None


def _read_text(path: Path) -> Optional[str]:
    return path.read_text() if path.exists() else None


def prepare_folder(source: Path, folder: Path) -> None:
    ext = source.suffix.lower()
    if ext not in SUPPORTED:
        raise BuildError(f"Unsupported file type {ext}. Use MusicXML (.mxl or .xml)")
    folder.mkdir(parents=True, exist_ok=True)
    midi_path = folder / "tune.mid"
    if ext == ".mxl":
        unpack_mxl(source, folder / "tune.xml")
    elif ext in (".xml", ".musicxml"):
        shutil.copy(source, folder / "tune.xml")
    else:
        shutil.copy(source, midi_path)
    if (folder / "tune.xml").exists():
        try:
            write_midi(converter.parse(str(folder / "tune.xml")), midi_path)
        except Exception as exc:
            raise BuildError(f"Could not read the score: {exc}") from exc
    try:
        _, per_inst = midi_to_note_sequences_with_instruments(midi_path)
    except Exception as exc:
        raise BuildError(f"Could not read MIDI: {exc}") from exc
    per_inst = [ns for ns in per_inst if ns.get("notes")]
    if not per_inst:
        raise BuildError("No notes found in the file")
    for i, ns in enumerate(per_inst, start=1):
        (folder / f"tune.inst{i}.ns.json").write_text(json.dumps(ns))


def _ns(directory: Path, base: str) -> Optional[Any]:
    return _read_json(directory / f"{base}.ns.json") or _read_json(directory / f"{base}.inst1.ns.json")


def collect_bundle(folder: Path, title: Optional[str] = None) -> Dict[str, Any]:
    out = folder / "output"
    teacher = _read_json(folder / "teacher.json") or {}
    if title:
        teacher["title"] = title
    tune_ns = _ns(out, "tune")
    if not tune_ns or not tune_ns.get("notes"):
        raise BuildError("Build produced no playable notes")

    def section(kind: str, items: list, keys: list[str]) -> tuple[list, dict, dict]:
        d = out / kind
        enriched, xmls, dsps = [], {}, {}
        for item in items:
            iid = item["id"]
            entry = {k: item.get(k) for k in keys if item.get(k) is not None}
            entry["id"] = iid
            entry["noteSequence"] = _ns(d, iid)
            lh, rh = _read_json(d / f"{iid}.lh.ns.json"), _read_json(d / f"{iid}.rh.ns.json")
            if lh: entry["leftHandSequence"] = lh
            if rh: entry["rightHandSequence"] = rh
            enriched.append(entry)
            if (x := _read_text(d / f"{iid}.xml")): xmls[iid] = x
            for suffix in ("", ".lh", ".rh"):
                if (x := _read_text(d / f"{iid}{suffix}.dsp.xml")): dsps[f"{iid}{suffix}"] = x
        return enriched, xmls, dsps

    nuggets, n_xml, n_dsp = section("nuggets", teacher.get("nuggets") or [], ["label", "location", "dependsOn", "modes"])
    assemblies, a_xml, a_dsp = section(
        "assemblies", teacher.get("assemblies") or [], ["tier", "label", "nuggetIds", "difficulty", "modes"]
    )
    bundle: Dict[str, Any] = {
        "briefing": {k: teacher.get(k) for k in (
            "schemaVersion", "title", "pipelineSettings", "motifs", "motifOccurrences",
            "tuneHints", "teachingOrder", "assemblyOrder") if teacher.get(k) is not None},
        "nuggets": nuggets or None,
        "assemblies": assemblies or None,
        "noteSequence": tune_ns,
        "leftHandSequence": _read_json(out / "tune.lh.ns.json"),
        "rightHandSequence": _read_json(out / "tune.rh.ns.json"),
        "tuneXml": _read_text(out / "tune.xml"),
        "nuggetXmls": n_xml or None,
        "assemblyXmls": a_xml or None,
        "tuneDspXml": _read_text(out / "tune.dsp.xml"),
        "nuggetDspXmls": n_dsp or None,
        "assemblyDspXmls": a_dsp or None,
    }
    return {k: v for k, v in bundle.items() if v is not None}


def build_bundle_from_file(source: Path, title: Optional[str] = None) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp) / "tune"
        prepare_folder(source, folder)
        try:
            build_tune(folder)
        except Exception as exc:
            raise BuildError(str(exc)) from exc
        return collect_bundle(folder, title)
