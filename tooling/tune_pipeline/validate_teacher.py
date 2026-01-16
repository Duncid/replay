from __future__ import annotations

from typing import Any, Dict, List


class TeacherValidationError(ValueError):
    pass


def validate_teacher(payload: Dict[str, Any]) -> None:
    if payload.get("schemaVersion") != "nuggets-teacher.v1":
        raise TeacherValidationError("schemaVersion must be 'nuggets-teacher.v1'")
    if "pipelineSettings" not in payload:
        raise TeacherValidationError("Missing pipelineSettings")
    nuggets = payload.get("nuggets")
    if not isinstance(nuggets, list) or not nuggets:
        raise TeacherValidationError("Missing nuggets list")
    for nugget in nuggets:
        if "id" not in nugget:
            raise TeacherValidationError("Each nugget must have an id")
        if "location" not in nugget:
            raise TeacherValidationError("Each nugget must have a location")
