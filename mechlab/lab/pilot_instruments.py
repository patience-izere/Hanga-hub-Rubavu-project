from __future__ import annotations

from numbers import Real

from django.core.exceptions import ValidationError

from .models import PilotObservation

INTERVIEW_THEMES = {
    "access",
    "cognitive_load",
    "device_limit",
    "fallback",
    "instructional_value",
    "language",
    "offline",
    "safety",
    "support",
    "tracking",
    "workload",
}


def _number(value, *, minimum=0, maximum=None, name="value") -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValidationError({"responses": f"{name} must be numeric."})
    result = float(value)
    if result < minimum or (maximum is not None and result > maximum):
        upper = f" and {maximum}" if maximum is not None else ""
        raise ValidationError({"responses": f"{name} must be between {minimum}{upper}."})
    return result


def _ratings(values, *, name, exact_length=None, minimum_length=1) -> list[int]:
    if not isinstance(values, list):
        raise ValidationError({"responses": f"{name} must be a list."})
    if exact_length is not None and len(values) != exact_length:
        raise ValidationError({"responses": f"{name} must contain {exact_length} ratings."})
    if len(values) < minimum_length:
        raise ValidationError({"responses": f"{name} must contain at least one rating."})
    if any(
        isinstance(item, bool) or not isinstance(item, int) or not 1 <= item <= 5 for item in values
    ):
        raise ValidationError({"responses": f"Every {name} rating must be an integer from 1 to 5."})
    return values


def validate_pilot_observation(instrument: str, responses: object) -> dict:
    if not isinstance(responses, dict):
        raise ValidationError({"responses": "Responses must be an object."})

    if instrument in {PilotObservation.Instrument.PRE_TEST, PilotObservation.Instrument.POST_TEST}:
        return {"score": _number(responses.get("score"), maximum=100, name="score")}

    if instrument == PilotObservation.Instrument.SUS:
        return {"items": _ratings(responses.get("items"), name="SUS", exact_length=10)}

    if instrument == PilotObservation.Instrument.TAM:
        return {
            construct: _ratings(responses.get(construct), name=construct)
            for construct in ["usefulness", "ease", "enjoyment", "intention"]
        }

    if instrument == PilotObservation.Instrument.TRANSFER:
        normalized = {
            criterion: _number(responses.get(criterion), maximum=4, name=criterion)
            for criterion in ["sequence", "accuracy", "safety", "time", "independence"]
        }
        critical = responses.get("criticalSafetyFailure")
        if not isinstance(critical, bool):
            raise ValidationError({"responses": "criticalSafetyFailure must be true or false."})
        normalized["criticalSafetyFailure"] = critical
        normalized["durationSeconds"] = _number(
            responses.get("durationSeconds"),
            maximum=14400,
            name="durationSeconds",
        )
        return normalized

    if instrument == PilotObservation.Instrument.INSTRUCTOR_WORKLOAD:
        acceptable = responses.get("acceptable")
        if not isinstance(acceptable, bool):
            raise ValidationError({"responses": "acceptable must be true or false."})
        normalized = {
            "preparationMinutes": _number(
                responses.get("preparationMinutes"), maximum=1440, name="preparationMinutes"
            ),
            "supportMinutes": _number(
                responses.get("supportMinutes"), maximum=1440, name="supportMinutes"
            ),
            "supportIncidents": int(
                _number(responses.get("supportIncidents"), maximum=1000, name="supportIncidents")
            ),
            "acceptable": acceptable,
        }
        for field, maximum in {
            "downloads": 100000,
            "downloadFailures": 100000,
            "crashCount": 100000,
            "storageUsedMb": 1000000,
            "synchronizationIncidents": 100000,
        }.items():
            normalized[field] = _number(responses.get(field, 0), maximum=maximum, name=field)
        return normalized

    if instrument in {
        PilotObservation.Instrument.LEARNER_INTERVIEW,
        PilotObservation.Instrument.INSTRUCTOR_INTERVIEW,
    }:
        themes = responses.get("themes")
        if not isinstance(themes, list) or not themes:
            raise ValidationError({"responses": "At least one coded interview theme is required."})
        if len(themes) != len(set(themes)) or any(
            theme not in INTERVIEW_THEMES for theme in themes
        ):
            raise ValidationError(
                {"responses": "Interview themes contain duplicates or unknown codes."}
            )
        summary = responses.get("redactedSummary", "")
        if not isinstance(summary, str) or len(summary.strip()) > 2000:
            raise ValidationError(
                {"responses": "The redacted summary may contain at most 2000 characters."}
            )
        return {"themes": sorted(themes), "redactedSummary": summary.strip()}

    raise ValidationError({"instrument": "Unsupported pilot instrument."})


def sus_score(items: list[int]) -> float:
    contribution = sum(
        (value - 1) if index % 2 == 0 else (5 - value) for index, value in enumerate(items)
    )
    return contribution * 2.5
