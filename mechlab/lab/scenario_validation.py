"""Strict, renderer-neutral publication checks for authored scenarios."""

from django.core.exceptions import ValidationError

from .models import AssetPackage, Lesson


def _non_empty_text(value):
    return isinstance(value, str) and bool(value.strip())


def validate_scenario_for_publication(scenario):
    definition = scenario.definition
    errors = []
    if scenario.lesson.status != Lesson.Status.PUBLISHED:
        errors.append("Publish the reviewed lesson before publishing its scenario.")
    if definition.get("format") != "opedu-scenario/v2":
        errors.append("Use the opedu-scenario/v2 definition format.")

    renderers = definition.get("renderers")
    if not isinstance(renderers, dict):
        errors.append("Define renderer configuration.")
        renderers = {}
    accessible = renderers.get("accessible_2d", {})
    if not isinstance(accessible, dict) or not accessible.get("required"):
        errors.append("Accessible 2D must be a required renderer.")
    if not isinstance(accessible, dict) or not accessible.get("evidenceParity"):
        errors.append("Accessible 2D must preserve evidence parity.")

    fallback = definition.get("fallback")
    if not isinstance(fallback, dict) or fallback.get("mode") != "accessible_2d":
        errors.append("Define accessible_2d as the fallback mode.")
    else:
        if fallback.get("preserveAttempt") is not True:
            errors.append("Fallback must preserve the active attempt.")
        if fallback.get("trackingFailureAffectsGrade") is not False:
            errors.append("Tracking failure must not affect the learner's grade.")

    steps = definition.get("steps")
    if not isinstance(steps, list) or not steps:
        errors.append("Add at least one complete procedure step.")
        steps = []
    step_codes = set()
    orders = set()
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            errors.append(f"Step {index} must be an object.")
            continue
        prefix = f"Step {index}"
        for field in ("code", "title", "instruction", "action_code"):
            if not _non_empty_text(step.get(field)):
                errors.append(f"{prefix} requires {field}.")
        code = step.get("code")
        if code in step_codes:
            errors.append(f"Step code {code!r} is duplicated.")
        step_codes.add(code)
        order = step.get("order")
        if not isinstance(order, int) or order < 1 or order in orders:
            errors.append(f"{prefix} requires a unique positive order.")
        orders.add(order)
        for field in ("tools", "hazards", "hints", "competency_codes"):
            if not isinstance(step.get(field), list):
                errors.append(f"{prefix} must define {field}, even when it is empty.")
        if not step.get("competency_codes"):
            errors.append(f"{prefix} requires at least one competency mapping.")
        actions = step.get("acceptable_actions")
        if not isinstance(actions, list) or not actions:
            errors.append(f"{prefix} requires at least one equivalent fallback action.")
        elif step.get("action_code") not in {
            action.get("action_code") for action in actions if isinstance(action, dict)
        }:
            errors.append(f"{prefix} primary action is missing from acceptable_actions.")
    if orders and orders != set(range(1, len(steps) + 1)):
        errors.append("Step order must be contiguous from 1.")

    enabled_spatial = any(
        isinstance(renderers.get(name), dict) and renderers[name].get("enabled")
        for name in ("desktop_3d", "marker_ar", "markerless_ar")
    )
    if enabled_spatial and scenario.asset_package_id is None:
        errors.append("Enabled 3D or AR renderers require a published asset package.")
    if scenario.asset_package_id:
        package = scenario.asset_package
        if package.status != AssetPackage.Status.PUBLISHED:
            errors.append("Publish the asset package before publishing the scenario.")
        manifest = package.manifest if isinstance(package.manifest, dict) else {}
        for field in ("schemaVersion", "curriculumOwner", "license"):
            if not manifest.get(field):
                errors.append(f"The asset manifest requires {field}.")
        if enabled_spatial and not package.files.filter(role="primary-scene").exists():
            errors.append("The asset package requires a primary-scene file.")

    marker = renderers.get("marker_ar", {})
    if isinstance(marker, dict) and marker.get("enabled"):
        if not _non_empty_text(marker.get("targetValue")):
            errors.append("Marker AR requires a stable targetValue.")
        if marker.get("manualControlledRigFallback") is not True:
            errors.append("Marker AR requires its controlled-rig fallback.")

    if errors:
        raise ValidationError({"publication": errors})
