from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def split_note_sequence(
    full_sequence: Dict[str, Any], hands_map: Dict[str, Any]
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    notes = full_sequence.get("notes", [])
    hand_entries = hands_map.get("notes", [])
    rh_notes: List[Dict[str, Any]] = []
    lh_notes: List[Dict[str, Any]] = []
    for note, mapping in zip(notes, hand_entries):
        hand = mapping.get("hand")
        if hand == "RH":
            rh_notes.append(note)
        elif hand == "LH":
            lh_notes.append(note)
    if not rh_notes and not lh_notes:
        return None, None
    base = {
        "tempos": full_sequence.get("tempos", []),
        "timeSignatures": full_sequence.get("timeSignatures", []),
        "totalTime": full_sequence.get("totalTime", 0.0),
        "metadata": full_sequence.get("metadata", {}),
    }
    rh_seq = None
    lh_seq = None
    if rh_notes:
        rh_seq = {**base, "notes": rh_notes}
    if lh_notes:
        lh_seq = {**base, "notes": lh_notes}
    return rh_seq, lh_seq
