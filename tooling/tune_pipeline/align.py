from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .mxl_parse import ScoreEvent


@dataclass
class AlignmentResult:
    hands_map: Dict[str, Any]
    score_matches: List[Optional[ScoreEvent]]
    mode_used: str


def _local_ioi(starts: List[float], index: int) -> float:
    if len(starts) < 2:
        return 0.5
    prev_gap = starts[index] - starts[index - 1] if index > 0 else None
    next_gap = starts[index + 1] - starts[index] if index < len(starts) - 1 else None
    gaps = [gap for gap in (prev_gap, next_gap) if gap is not None and gap > 0]
    return min(gaps) if gaps else 0.5


def _pitch_split(notes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not notes:
        return []
    median_pitch = sorted(note["pitch"] for note in notes)[len(notes) // 2]
    return [
        {
            "hand": "RH" if note["pitch"] >= median_pitch else "LH",
            "confidence": 0.2,
        }
        for note in notes
    ]


def _map_staff_to_hand(staff: int, staff_map: Dict[str, str]) -> str:
    return staff_map.get(str(staff), "Unknown")


def align_notes(
    notes: List[Dict[str, Any]],
    score_events: List[ScoreEvent],
    pipeline_settings: Dict[str, Any],
) -> AlignmentResult:
    policy = pipeline_settings.get("handSplitPolicy", {})
    mode = policy.get("mode", "none")
    cross_staff = policy.get("crossStaffHandling", "discourage")
    staff_map = pipeline_settings.get("staffToHandDefault", {})

    notes_map: List[Dict[str, Any]] = []
    score_matches: List[Optional[ScoreEvent]] = [None] * len(notes)
    quality = {"matchedNotes": 0, "totalNotes": len(notes), "matchRate": 0.0}

    if mode == "pitchSplit":
        notes_map = _pitch_split(notes)
    else:
        # Estimate global shift (Audio-Score alignment)
        valid_deltas = []
        # Check a sample of notes to find potential global offset
        sample_size = min(len(notes), 20)
        search_window = min(len(score_events), 100)
        for i in range(sample_size):
            n = notes[i]
            for j in range(search_window):
                e = score_events[j]
                if n["pitch"] == e.pitch:
                    valid_deltas.append(n["startTime"] - e.onset_seconds)
        
        global_shift = 0.0
        if valid_deltas:
            # Simple clustering: find most common delta range
            valid_deltas.sort()
            # We expect a dense cluster. Take median of the dense cluster?
            # heuristic: median of the whole set might be okay if outlier count is low.
            # But let's take the median of values within +/- 1s of the median?
            median_delta = valid_deltas[len(valid_deltas)//2]
            cluster = [d for d in valid_deltas if abs(d - median_delta) < 2.0]
            if cluster:
                global_shift = sum(cluster) / len(cluster)
        
        print(f"Debug: Detected global shift: {global_shift:.3f}s")
        
        starts = [note["startTime"] for note in notes]
        for idx, note in enumerate(notes):
            candidates = [ev for ev in score_events if ev.pitch == note["pitch"]]
            local_ioi = _local_ioi(starts, idx)
            tolerance = max(0.08, 0.25 * local_ioi)
            best = None
            best_delta = None
            for ev in candidates:
                # Apply shift to score event time to match performance time
                aligned_onset = ev.onset_seconds + global_shift
                delta = abs(aligned_onset - note["startTime"])
                if delta <= tolerance and (best_delta is None or delta < best_delta):
                    best = ev
                    best_delta = delta
            if best is None:
                notes_map.append({"hand": "Unknown", "confidence": 0.0})
                continue
            score_matches[idx] = best
            if best_delta <= 0.03:
                confidence = 1.0
            elif best_delta <= 0.08:
                confidence = 0.7
            else:
                confidence = 0.4
            if mode == "byStaff":
                hand = _map_staff_to_hand(best.staff, staff_map)
                if hand == "Unknown" and cross_staff == "allow":
                    hand = "RH" if note["pitch"] >= 60 else "LH"
                    confidence = min(confidence, 0.4)
            else:
                hand = "Unknown"
            notes_map.append({"hand": hand, "confidence": confidence})
            if confidence >= 0.4:
                quality["matchedNotes"] += 1
        quality["matchRate"] = quality["matchedNotes"] / max(1, quality["totalNotes"])

        fallback = pipeline_settings.get("alignmentPolicy", {}).get(
            "fallbackIfLowConfidence"
        )
        if mode == "byStaff" and quality["matchRate"] < 0.7 and fallback == "pitchSplit":
            notes_map = _pitch_split(notes)
            mode = "pitchSplit"

    notes_entries = [
        {
            "index": idx,
            "hand": mapping["hand"],
            "confidence": float(mapping["confidence"]),
        }
        for idx, mapping in enumerate(notes_map)
    ]
    hands_map = {
        "schemaVersion": "hands-map.v1",
        "source": {
            "midi": pipeline_settings.get("sourceMidi"),
            "musicxml": pipeline_settings.get("sourceMusicXml"),
        },
        "policy": {
            "mode": mode,
            "crossStaffHandling": cross_staff,
            "staffToHandDefault": staff_map,
        },
        "quality": {
            "matchedNotes": quality["matchedNotes"],
            "totalNotes": quality["totalNotes"],
            "matchRate": quality["matchRate"],
        },
        "notes": notes_entries,
        "pipelineSettings": pipeline_settings,
    }
    return AlignmentResult(hands_map=hands_map, score_matches=score_matches, mode_used=mode)
