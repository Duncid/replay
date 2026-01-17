from __future__ import annotations

from typing import Any, Dict, List


class TeacherValidationError(ValueError):
    pass


def validate_teacher(payload: Dict[str, Any]) -> None:
    valid_schemas = ["nuggets-teacher.v1", "teacher.v2"]
    if payload.get("schemaVersion") not in valid_schemas:
        raise TeacherValidationError(f"schemaVersion must be one of {valid_schemas}")
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
