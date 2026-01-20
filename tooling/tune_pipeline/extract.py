from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

from music21 import converter, stream, tempo

from tune_pipeline.mxl_unpack import unpack_mxl

DEFAULT_GHOST_THRESHOLD_SECONDS = 0.10
DEFAULT_TEMPO_QPM = 120.0


class ExtractionError(RuntimeError):
    pass


def _note_duration_seconds(
    element: stream.Music21Object, default_qpm: float
) -> float:
    mark = element.getContextByClass(tempo.MetronomeMark)
    qpm = default_qpm
    if mark is not None:
        try:
            qpm_value = mark.getQuarterBPM()
        except Exception:
            qpm_value = None
        if qpm_value:
            qpm = float(qpm_value)
        elif mark.number:
            qpm = float(mark.number)
    if qpm <= 0:
        qpm = default_qpm
    quarter_length = float(element.duration.quarterLength)
    return quarter_length * 60.0 / qpm


def remove_ghost_notes(
    score: stream.Score,
    threshold_seconds: float = DEFAULT_GHOST_THRESHOLD_SECONDS,
    default_qpm: float = DEFAULT_TEMPO_QPM,
) -> Tuple[int, int]:
    notes = list(score.recurse().notes)
    total = len(notes)
    removed = 0
    for element in notes:
        duration_seconds = _note_duration_seconds(element, default_qpm)
        if duration_seconds < threshold_seconds:
            site = element.activeSite
            if site is not None:
                site.remove(element)
                removed += 1
    return removed, total


def extract_xml(
    tune_folder: Path,
    threshold_seconds: float = DEFAULT_GHOST_THRESHOLD_SECONDS,
) -> Path:
    if not tune_folder.exists():
        raise ExtractionError(f"Folder not found: {tune_folder}")

    mxl_path = tune_folder / "tune.mxl"
    if not mxl_path.exists():
        raise ExtractionError(f"Missing file: {mxl_path.name}")

    xml_path = tune_folder / "tune.xml"
    unpack_mxl(mxl_path, xml_path)

    score = converter.parse(str(xml_path))
    removed, total = remove_ghost_notes(score, threshold_seconds=threshold_seconds)
    score.write("musicxml", fp=str(xml_path))

    print("Extraction summary:")
    print(f"- total notes: {total}")
    print(f"- ghost notes removed: {removed}")
    print(f"- threshold seconds: {threshold_seconds:.3f}")
    print(f"- cleaned xml: {xml_path}")

    return xml_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract and clean MusicXML from an MXL archive"
    )
    parser.add_argument("tune_folder", type=Path)
    parser.add_argument(
        "--threshold-seconds",
        type=float,
        default=DEFAULT_GHOST_THRESHOLD_SECONDS,
    )
    args = parser.parse_args()
    extract_xml(args.tune_folder, threshold_seconds=args.threshold_seconds)


if __name__ == "__main__":
    main()
