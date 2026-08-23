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
