from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
from music21 import meter, stream

from tune_pipeline.nuggets_extract import (
    _measure_offset,
    _offset_to_seconds,
    _tempo_boundaries,
)


@dataclass
class _Candidate:
    kind: str  # "1bar" | "2bar"
    start_m: int
    location: Dict[str, Any]
    note_count: int


def _beats_in_measure(part: stream.Part, measure_num: int) -> int:
    m = part.measure(measure_num)
    if m is None:
        return 4
    ts = m.timeSignature
    if not ts:
        found = part.recurse().getElementsByClass(meter.TimeSignature).first()
        ts = found
    return int(ts.numerator) if ts else 4


def _end_of_measure_beat(part: stream.Part, measure_num: int) -> Tuple[int, float]:
    beats = _beats_in_measure(part, measure_num)
    return measure_num, float(beats + 1)


def _measure_list(part: stream.Part) -> List[int]:
    nums = [m.number for m in part.getElementsByClass(stream.Measure)]
    return sorted(set(nums))


def _window_seconds(
    score: stream.Score,
    part: stream.Part,
    location: Dict[str, Any],
) -> Tuple[float, float]:
    sm = int(location["startMeasure"])
    sb = float(location.get("startBeat", 1))
    em = int(location["endMeasure"])
    eb = float(location.get("endBeat", 1))
    boundaries = _tempo_boundaries(score)
    start_offset = _measure_offset(part, sm, sb)
    end_offset = _measure_offset(part, em, eb)
    return (
        _offset_to_seconds(start_offset, boundaries),
        _offset_to_seconds(end_offset, boundaries),
    )


def _count_notes(
    note_sequences: Dict[str, Dict[str, Any]],
    t0: float,
    t1: float,
) -> int:
    n = 0
    for ns in note_sequences.values():
        for note in ns.get("notes", []) or []:
            st = float(note.get("startTime", 0.0))
            if t0 <= st < t1:
                n += 1
    return n


def _collect_candidates(
    score: stream.Score,
    part: stream.Part,
    note_sequences: Dict[str, Dict[str, Any]],
    min_notes: int = 2,
) -> List[_Candidate]:
    measures = _measure_list(part)
    if not measures:
        return []

    max_m = max(measures)
    out: List[_Candidate] = []

    # 1-bar windows: full measure m
    for m in measures:
        start_loc = {"startMeasure": m, "startBeat": 1.0}
        if m < max_m:
            end_loc = {"endMeasure": m + 1, "endBeat": 1.0}
        else:
            em, eb = _end_of_measure_beat(part, m)
            end_loc = {"endMeasure": em, "endBeat": eb}
        loc = {**start_loc, **end_loc}
        t0, t1 = _window_seconds(score, part, loc)
        c = _count_notes(note_sequences, t0, t1)
        if c >= min_notes:
            out.append(_Candidate("1bar", m, loc, c))

    # 2-bar windows: consecutive measures
    measure_set = set(measures)
    for m in measures:
        if m + 1 not in measure_set:
            continue
        start_loc = {"startMeasure": m, "startBeat": 1.0}
        if m + 2 <= max_m and (m + 2) in measure_set:
            end_loc = {"endMeasure": m + 2, "endBeat": 1.0}
        else:
            em, eb = _end_of_measure_beat(part, m + 1)
            end_loc = {"endMeasure": em, "endBeat": eb}
        loc = {**start_loc, **end_loc}
        t0, t1 = _window_seconds(score, part, loc)
        c = _count_notes(note_sequences, t0, t1)
        if c >= min_notes:
            out.append(_Candidate("2bar", m, loc, c))

    def sort_key(x: _Candidate) -> Tuple[int, int, int]:
        # shorter (1 bar) before longer (2 bar) at same start
        kind_order = 0 if x.kind == "1bar" else 1
        span = 1 if x.kind == "1bar" else 2
        return (x.start_m, kind_order, span)

    out.sort(key=sort_key)
    return out


def _nugget_label(loc: Dict[str, Any], kind: str) -> str:
    sm = int(loc["startMeasure"])
    em = int(loc["endMeasure"])
    if kind == "1bar":
        return f"Bar {sm}"
    if sm + 1 == em and float(loc.get("endBeat", 1)) == 1.0:
        return f"Bars {sm}–{em}"
    return f"Bars {sm}–{em}"


def _assign_ids_and_deps(candidates: List[_Candidate]) -> List[Dict[str, Any]]:
    id_by_1bar_start: Dict[int, str] = {}

    for i, cand in enumerate(candidates, start=1):
        nid = f"N{i}"
        if cand.kind == "1bar":
            id_by_1bar_start[cand.start_m] = nid

    nuggets: List[Dict[str, Any]] = []
    for i, cand in enumerate(candidates, start=1):
        nid = f"N{i}"
        prereqs: List[str] = []
        if cand.kind == "1bar":
            m = cand.start_m
            prev_id = id_by_1bar_start.get(m - 1)
            if prev_id and prev_id != nid:
                prereqs.append(prev_id)
        else:
            m = cand.start_m
            a = id_by_1bar_start.get(m)
            b = id_by_1bar_start.get(m + 1)
            if a:
                prereqs.append(a)
            if b and b != a:
                prereqs.append(b)
        seen = set()
        deduped = []
        for p in prereqs:
            if p not in seen:
                seen.add(p)
                deduped.append(p)

        loc = {k: v for k, v in cand.location.items() if not str(k).startswith("_")}
        nuggets.append(
            {
                "id": nid,
                "length": cand.note_count,
                "location": loc,
                "label": _nugget_label(loc, cand.kind),
                "dependsOn": deduped,
                "modes": ["RH", "LH", "HandsTogether"],
            }
        )

    return nuggets


def teaching_order_from_nuggets(nuggets: List[Dict[str, Any]]) -> List[str]:
    g = nx.DiGraph()
    for n in nuggets:
        g.add_node(n["id"])
    for n in nuggets:
        for dep in n.get("dependsOn") or []:
            if any(x["id"] == dep for x in nuggets):
                g.add_edge(dep, n["id"])

    if not nx.is_directed_acyclic_graph(g):
        return [n["id"] for n in sorted(nuggets, key=lambda x: x["id"])]

    tie_order = {
        n["id"]: i
        for i, n in enumerate(
            sorted(nuggets, key=lambda x: (int(x["location"]["startMeasure"]), x["id"]))
        )
    }

    def sort_key(nid: str) -> Tuple[int, str]:
        return (tie_order.get(nid, 0), nid)

    return list(nx.lexicographical_topological_sort(g, key=sort_key))


def _assemblies_from_nuggets(
    nuggets: List[Dict[str, Any]],
    teaching_order: List[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Build tiered assemblies from 1-bar nuggets in chronological order."""

    def start_measure(nid: str) -> int:
        loc = next(n["location"] for n in nuggets if n["id"] == nid)
        return int(loc["startMeasure"])

    def _is_single_bar_nugget(loc: Dict[str, Any]) -> bool:
        sm = int(loc["startMeasure"])
        em = int(loc["endMeasure"])
        sb = float(loc.get("startBeat", 1))
        eb = float(loc.get("endBeat", 1))
        if sb != 1.0:
            return False
        if sm + 1 == em and eb == 1.0:
            return True
        if sm == em and eb > 1.0:
            return True
        return False

    strict_1bar = [n for n in nuggets if _is_single_bar_nugget(n["location"])]
    strict_1bar.sort(key=lambda n: start_measure(n["id"]))
    ids_1 = [n["id"] for n in strict_1bar]
    if len(ids_1) < 2:
        # fall back: use teaching order slice
        ids_1 = list(teaching_order)

    assemblies: List[Dict[str, Any]] = []
    aid = 1

    def chunk(ids: List[str], size: int, step: int, tier: int) -> None:
        nonlocal aid
        i = 0
        while i + size <= len(ids):
            window = ids[i : i + size]
            assemblies.append(
                {
                    "id": f"A{aid}",
                    "tier": tier,
                    "label": f"Assembly tier {tier} ({size} cells)",
                    "nuggetIds": window,
                    "modes": ["RH", "LH", "HandsTogether"],
                }
            )
            aid += 1
            i += step

    chunk(ids_1, 2, 2, 1)
    if len(ids_1) >= 4:
        chunk(ids_1, 4, 4, 2)
    if len(ids_1) >= 8:
        chunk(ids_1, min(8, len(ids_1)), 8, 3)
    elif len(ids_1) > 4 and not any(a["tier"] == 3 for a in assemblies):
        assemblies.append(
            {
                "id": f"A{aid}",
                "tier": 3,
                "label": "Assembly tier 3 (extended)",
                "nuggetIds": ids_1[: min(len(ids_1), 12)],
                "modes": ["RH", "LH", "HandsTogether"],
            }
        )

    order = sorted(
        [a["id"] for a in assemblies],
        key=lambda x: (next(a["tier"] for a in assemblies if a["id"] == x), x),
    )
    return assemblies, order


def default_pipeline_settings(metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    md = copy.deepcopy(metadata) if metadata else {}
    if "assumedTempoQpm" not in md:
        md["assumedTempoQpm"] = 120
    if "assumedTimeSignature" not in md:
        md["assumedTimeSignature"] = "4/4"
    return {
        "metadata": md,
        "dsp": {"gridQuarterLength": 0.25, "chordCap": 6},
        "handAssignmentPolicy": {
            "mode": "byInstrument",
            "instrumentToHand": {
                "inst1": "RH",
                "inst2": "LH",
            },
        },
    }


def infer_metadata_from_ns(ns: Dict[str, Any]) -> Dict[str, Any]:
    tempos = list(ns.get("tempos", []) or [])
    qpm = 120.0
    if tempos:
        qpm = float(tempos[0].get("qpm", 120))
    ts_str = "4/4"
    ts_list = list(ns.get("timeSignatures", []) or [])
    if ts_list:
        num = int(ts_list[0].get("numerator", 4))
        den = int(ts_list[0].get("denominator", 4))
        ts_str = f"{num}/{den}"
    total = float(ns.get("totalTime", 0.0) or 0.0)
    # Rough measure count for NS-derived skeleton (unused if XML exists)
    assumed_measures = max(4, int(total * qpm / 60.0 / 4) + 2)
    return {
        "assumedTempoQpm": qpm,
        "assumedTimeSignature": ts_str,
        "assumedMeasuresFromTotalTime": assumed_measures,
    }


def generate_teacher_payload(
    score: stream.Score,
    combined_part: stream.Part,
    note_sequences: Dict[str, Dict[str, Any]],
    *,
    tune_title: str,
    metadata: Optional[Dict[str, Any]] = None,
    min_notes: int = 2,
) -> Dict[str, Any]:
    inst_keys = sorted(note_sequences.keys())
    if not inst_keys:
        raise ValueError("generate_teacher_payload: note_sequences is empty")

    pipeline = default_pipeline_settings(metadata)
    if len(inst_keys) >= 2:
        instrument_to_hand = {inst_keys[0]: "RH", inst_keys[1]: "LH"}
    else:
        instrument_to_hand = {inst_keys[0]: "RH"}
    pipeline["handAssignmentPolicy"] = {
        "mode": "byInstrument",
        "instrumentToHand": instrument_to_hand,
    }

    cands = _collect_candidates(score, combined_part, note_sequences, min_notes=min_notes)
    if not cands:
        raise ValueError(
            "structure_generate: no nugget candidates (check measures / NoteSequence alignment)"
        )

    nuggets = _assign_ids_and_deps(cands)
    teaching_order = teaching_order_from_nuggets(nuggets)
    for n in nuggets:
        n["dependsOn"] = [d for d in n["dependsOn"] if d in teaching_order]

    assemblies, assembly_order = _assemblies_from_nuggets(nuggets, teaching_order)

    single_track = len(inst_keys) == 1
    practice_modes = ["RH"] if single_track else ["RH", "LH", "HandsTogether"]
    for n in nuggets:
        n["modes"] = practice_modes
    for a in assemblies:
        a["modes"] = practice_modes

    instrument_plans = [
        {"id": inst_keys[0], "name": "Piano RH"},
    ]
    if len(inst_keys) > 1:
        instrument_plans.append({"id": inst_keys[1], "name": "Piano LH"})

    return {
        "schemaVersion": "teacher.v2",
        "title": tune_title,
        "pipelineSettings": pipeline,
        "instrumentPlans": instrument_plans,
        "nuggets": nuggets,
        "assemblies": assemblies,
        "teachingOrder": teaching_order,
        "assemblyOrder": assembly_order,
    }
