from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Tuple

from music21 import stream


@dataclass
class HandSplitResult:
    rh_score: Optional[stream.Score]
    lh_score: Optional[stream.Score]
    reason: str


def _collect_staff_numbers(part: stream.Part) -> Tuple[Dict[int, int], int]:
    counts: Dict[int, int] = {}
    missing = 0
    for note in part.recurse().notes:
        staff_num = getattr(note, "staffNumber", None)
        if staff_num is None:
            missing += 1
            continue
        counts[staff_num] = counts.get(staff_num, 0) + 1
    return counts, missing


def _filter_part_by_staff(part: stream.Part, staff: int) -> stream.Part:
    new_part = part.deepcopy()
    for element in list(new_part.recurse().notesAndRests):
        staff_num = getattr(element, "staffNumber", None)
        if staff_num is None:
            continue
        if staff_num != staff:
            element.activeSite.remove(element)
    return new_part


def split_by_staff(
    score: stream.Score,
    part: stream.Part,
    staff_to_hand: Dict[str, str],
) -> HandSplitResult:
    staff_counts, missing = _collect_staff_numbers(part)
    if missing:
        return HandSplitResult(None, None, "Staff numbers missing; skipping split")
    if len(staff_counts) < 2:
        return HandSplitResult(None, None, "Less than two staves; skipping split")
    rh_staffs = [int(staff) for staff, hand in staff_to_hand.items() if hand.upper() == "RH"]
    lh_staffs = [int(staff) for staff, hand in staff_to_hand.items() if hand.upper() == "LH"]
    if not rh_staffs or not lh_staffs:
        return HandSplitResult(None, None, "Staff-to-hand mapping incomplete")
    rh_part = _filter_part_by_staff(part, rh_staffs[0])
    lh_part = _filter_part_by_staff(part, lh_staffs[0])
    rh_score = stream.Score(id=f"{score.id}-rh")
    lh_score = stream.Score(id=f"{score.id}-lh")
    rh_score.insert(0, rh_part)
    lh_score.insert(0, lh_part)
    return HandSplitResult(rh_score, lh_score, "Split by staff")
