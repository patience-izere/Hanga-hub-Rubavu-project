"""Build immutable scenario definitions from normalized authoring records."""

from django.db.models import Prefetch

from .models import ProcedureStep, StepTolerance


def build_scenario_definition(lesson):
    steps = lesson.procedure_steps.prefetch_related(
        "competencies",
        "required_tools",
        "hazards",
        "hints",
        "feedback_rules",
        Prefetch("tolerances", queryset=StepTolerance.objects.order_by("code")),
        "acceptable_actions__tolerance",
    ).order_by("order")
    return {
        "format": "opedu-scenario/v2",
        "renderers": {
            "accessible_2d": {"required": True, "evidenceParity": True},
            "desktop_3d": {"enabled": True, "qualityTiers": ["low", "medium", "high"]},
            "marker_ar": {
                "enabled": True,
                "targetType": "qr-fiducial",
                "targetValue": f"OPEDU-{lesson.slug}-V{lesson.content_version}",
                "manualControlledRigFallback": True,
            },
            "markerless_ar": {
                "enabled": True,
                "requiredFeatures": ["hit-test"],
                "optionalFeatures": ["anchors", "local-floor", "dom-overlay"],
            },
        },
        "performanceBudgets": {
            "initialAssetBytes": 5_000_000,
            "cachedLoadSeconds": 3,
            "minimumFramesPerSecond": 24,
            "maximumTextureDimension": 2048,
        },
        "fallback": {
            "mode": "accessible_2d",
            "preserveAttempt": True,
            "trackingFailureAffectsGrade": False,
        },
        "competencies": [
            {
                "id": competency.pk,
                "code": competency.code,
                "title": competency.title,
                "mastery_threshold": competency.mastery_threshold,
            }
            for competency in lesson.competencies.order_by("code")
        ],
        "steps": [_snapshot_step(step) for step in steps],
    }


def _snapshot_step(step: ProcedureStep):
    tolerances = {
        tolerance.pk: {
            "code": tolerance.code,
            "measurement": tolerance.measurement,
            "minimum_value": str(tolerance.minimum_value),
            "maximum_value": str(tolerance.maximum_value),
            "unit": tolerance.unit,
        }
        for tolerance in step.tolerances.all()
    }
    actions = [
        {
            "action_code": action.action_code,
            "label": action.label,
            "is_primary": action.is_primary,
            "tolerance": tolerances.get(action.tolerance_id),
        }
        for action in step.acceptable_actions.all()
    ]
    if not actions:
        actions = [
            {
                "action_code": step.action_code,
                "label": step.title,
                "is_primary": True,
                "tolerance": None,
            }
        ]
    feedback = {rule.outcome: rule.message for rule in step.feedback_rules.all()}
    feedback.setdefault("correct", step.feedback)
    return {
        "id": step.pk,
        "order": step.order,
        "code": step.code,
        "title": step.title,
        "instruction": step.instruction,
        "action_code": next(
            (action["action_code"] for action in actions if action["is_primary"]),
            actions[0]["action_code"],
        ),
        "feedback": feedback["correct"],
        "feedback_rules": feedback,
        "acceptable_actions": actions,
        "hints": [
            {
                "code": hint.code,
                "order": hint.order,
                "text": hint.text,
                "points_penalty": hint.points_penalty,
            }
            for hint in step.hints.all()
        ],
        "tolerances": list(tolerances.values()),
        "tools": [
            {"code": tool.code, "name": tool.name, "description": tool.description}
            for tool in step.required_tools.all()
        ],
        "hazards": [
            {
                "code": hazard.code,
                "title": hazard.title,
                "description": hazard.description,
                "mitigation": hazard.mitigation,
                "severity": hazard.severity,
            }
            for hazard in step.hazards.all()
        ],
        "competency_codes": list(step.competencies.order_by("code").values_list("code", flat=True)),
        "safety_critical": step.safety_critical,
        "points": step.points,
        "metadata": step.metadata,
    }


SPATIAL_RENDERERS = ("desktop_3d", "marker_ar", "markerless_ar")


def _as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_step(step, order):
    """Give an authored step every field the learner runtime and scoring read."""

    title = str(step.get("title") or "").strip()
    action_code = str(step.get("action_code") or "").strip()
    actions = step.get("acceptable_actions")
    if not isinstance(actions, list) or not actions:
        actions = [{"action_code": action_code, "label": title or action_code, "is_primary": True}]
    actions = [
        {
            "action_code": str(action.get("action_code") or "").strip(),
            "label": str(action.get("label") or title or action.get("action_code") or ""),
            "is_primary": bool(action.get("is_primary")),
            "tolerance": action.get("tolerance"),
        }
        for action in actions
        if isinstance(action, dict)
    ]
    if action_code and action_code not in {action["action_code"] for action in actions}:
        actions.insert(0, {"action_code": action_code, "label": title, "is_primary": True})
    for action in actions:
        action["is_primary"] = action["action_code"] == action_code
    feedback_rules = step.get("feedback_rules")
    feedback_rules = dict(feedback_rules) if isinstance(feedback_rules, dict) else {}
    feedback = str(step.get("feedback") or feedback_rules.get("correct") or "Step completed.")
    feedback_rules["correct"] = feedback
    hints = step.get("hints") if isinstance(step.get("hints"), list) else []
    points = step.get("points")
    return {
        **step,
        "id": step.get("id"),
        "order": order,
        "code": str(step.get("code") or f"step-{order}").strip(),
        "title": title,
        "instruction": str(step.get("instruction") or "").strip(),
        "action_code": action_code,
        "feedback": feedback,
        "feedback_rules": feedback_rules,
        "acceptable_actions": actions,
        "hints": [
            {
                "code": str(hint.get("code") or f"hint-{index}"),
                "order": index,
                "text": str(hint.get("text") or ""),
                "points_penalty": max(0, _as_int(hint.get("points_penalty"))),
            }
            for index, hint in enumerate(hints, start=1)
            if isinstance(hint, dict)
        ],
        "tolerances": step.get("tolerances") if isinstance(step.get("tolerances"), list) else [],
        "tools": step.get("tools") if isinstance(step.get("tools"), list) else [],
        "hazards": step.get("hazards") if isinstance(step.get("hazards"), list) else [],
        "competency_codes": [
            str(code).strip() for code in (step.get("competency_codes") or []) if str(code).strip()
        ],
        "safety_critical": step.get("safety_critical") is True,
        "points": points if isinstance(points, int) and points >= 0 else 10,
        "metadata": step.get("metadata") if isinstance(step.get("metadata"), dict) else {},
    }


def normalize_definition(definition, lesson):
    """Normalise an authored definition so publication checks and learners see the same data.

    Steps written by the Studio used to omit fields the learner serializer reads, which turned
    one authored module into a server error on every learner's assignment list.
    """

    from .models import Competency

    if not isinstance(definition, dict):
        return definition
    normalized = dict(definition)
    raw_steps = definition.get("steps")
    if isinstance(raw_steps, list):
        steps = [
            normalize_step(step, order)
            for order, step in enumerate(
                (item for item in raw_steps if isinstance(item, dict)), start=1
            )
        ]
        normalized["steps"] = steps
        used_codes = {code for step in steps for code in step["competency_codes"]}
        normalized["competencies"] = [
            {
                "id": competency.pk,
                "code": competency.code,
                "title": competency.title,
                "mastery_threshold": competency.mastery_threshold,
            }
            for competency in Competency.objects.filter(
                course=lesson.course, code__in=used_codes
            ).order_by("code")
        ]
    return normalized


def starter_definition(lesson):
    """A draft definition an author can edit, delivered in accessible 2D until assets exist."""

    definition = build_scenario_definition(lesson)
    for name in SPATIAL_RENDERERS:
        definition["renderers"][name]["enabled"] = False
    if not definition["steps"]:
        codes = list(lesson.competencies.order_by("code").values_list("code", flat=True))
        definition["steps"] = [
            {
                "order": 1,
                "code": "step-1",
                "title": "First procedure step",
                "instruction": "Describe the observable action the learner performs.",
                "action_code": "complete_step_1",
                "competency_codes": codes[:1],
                "safety_critical": False,
            }
        ]
    return normalize_definition(definition, lesson)
