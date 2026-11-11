"""Read a scenario definition the way an attempt experiences it.

A published definition is immutable, so everything that varies per attempt is derived here:
which equivalent fault case the learner was given, whether steps may be done in any order, what
a specific wrong action leads to, and how the pre-lesson check is scored.
"""

from __future__ import annotations

import random
from decimal import Decimal

FREE_SEQUENCE = "free"
ORDERED_SEQUENCE = "ordered"

# Effects the learner's device knows how to show. Unknown values fall back to a plain message.
CONSEQUENCE_EFFECTS = {
    "spark",
    "blown_fuse",
    "wrong_reading",
    "hazard",
    "damage",
    "none",
}


def scenario_variants(definition) -> list[dict]:
    variants = definition.get("variants") if isinstance(definition, dict) else None
    if not isinstance(variants, list):
        return []
    return [item for item in variants if isinstance(item, dict) and item.get("code")]


def choose_variant(definition, previous_codes=(), rng=random) -> str:
    """Pick a fault case, avoiding the one the learner met most recently when there is a choice."""

    codes = [str(item["code"]) for item in scenario_variants(definition)]
    if not codes:
        return ""
    recent = next((code for code in previous_codes if code), None)
    candidates = [code for code in codes if code != recent] or codes
    return rng.choice(candidates)


def resolved_steps(definition, variant_code="") -> list[dict]:
    """The scenario's steps with one variant's differences applied."""

    steps = definition.get("steps", []) if isinstance(definition, dict) else []
    variant = next(
        (item for item in scenario_variants(definition) if item["code"] == variant_code), None
    )
    overrides = variant.get("steps") if variant else None
    if not isinstance(overrides, dict):
        return list(steps)
    resolved = []
    for step in steps:
        override = overrides.get(step.get("code"))
        if not isinstance(override, dict):
            resolved.append(step)
            continue
        merged = {**step, **override}
        merged["metadata"] = {
            **(step.get("metadata") if isinstance(step.get("metadata"), dict) else {}),
            **(override.get("metadata") if isinstance(override.get("metadata"), dict) else {}),
        }
        # A variant changes what is right, never which step it is.
        merged["code"] = step.get("code")
        merged["order"] = step.get("order")
        resolved.append(merged)
    return resolved


def is_free_sequence(definition) -> bool:
    return isinstance(definition, dict) and definition.get("sequence") == FREE_SEQUENCE


def sequence_of(definition) -> str:
    return FREE_SEQUENCE if is_free_sequence(definition) else ORDERED_SEQUENCE


def accepted_action_codes(step) -> set[str]:
    actions = step.get("acceptable_actions") or [{"action_code": step.get("action_code")}]
    return {str(item.get("action_code")) for item in actions if isinstance(item, dict)}


def consequence_for(definition, step, action_code):
    """What a specific wrong action leads to, if the author described it."""

    for source in (step.get("mistakes"), definition.get("mistakes")):
        if not isinstance(source, dict):
            continue
        entry = source.get(action_code)
        if isinstance(entry, dict) and str(entry.get("message") or "").strip():
            effect = str(entry.get("effect") or "none")
            return {
                "effect": effect if effect in CONSEQUENCE_EFFECTS else "none",
                "message": str(entry["message"]).strip(),
            }
    return None


def _questions(definition) -> list[dict]:
    check = definition.get("knowledge_check") if isinstance(definition, dict) else None
    questions = check.get("questions") if isinstance(check, dict) else None
    if not isinstance(questions, list):
        return []
    valid = []
    for question in questions:
        if not isinstance(question, dict) or not question.get("code"):
            continue
        options = [
            {"code": str(option.get("code")), "label": str(option.get("label") or "")}
            for option in question.get("options") or []
            if isinstance(option, dict) and option.get("code")
        ]
        if len(options) < 2:
            continue
        valid.append({**question, "options": options})
    return valid


def public_knowledge_check(definition) -> list[dict]:
    """The pre-lesson questions without their answers or explanations."""

    return [
        {
            "code": str(question["code"]),
            "prompt": str(question.get("prompt") or ""),
            "options": question["options"],
        }
        for question in _questions(definition)
    ]


def score_knowledge_check(definition, answers):
    """Score submitted answers; returns ``(score, results)`` or ``(None, [])`` without a quiz."""

    questions = _questions(definition)
    if not questions:
        return None, []
    given = {
        str(item.get("questionCode")): item.get("response")
        for item in answers
        if isinstance(item, dict)
    }
    results = []
    for question in questions:
        code = str(question["code"])
        answer = str(question.get("answer") or "")
        response = given.get(code)
        results.append(
            {
                "questionCode": code,
                "answered": response is not None,
                "correct": response is not None and str(response) == answer,
                "correctOption": answer,
                "explanation": str(question.get("explanation") or ""),
            }
        )
    correct = sum(item["correct"] for item in results)
    score = (Decimal(correct) / Decimal(len(results)) * 100).quantize(Decimal("0.01"))
    return score, results


def normalize_choices(step) -> list[dict]:
    choices = step.get("choices")
    if not isinstance(choices, list):
        return []
    return [
        {
            "action_code": str(choice.get("action_code") or "").strip(),
            "label": str(choice.get("label") or choice.get("action_code") or "").strip(),
        }
        for choice in choices
        if isinstance(choice, dict) and str(choice.get("action_code") or "").strip()
    ]


def normalize_mistakes(step) -> dict:
    mistakes = step.get("mistakes")
    if not isinstance(mistakes, dict):
        return {}
    cleaned = {}
    for action_code, entry in mistakes.items():
        if not isinstance(entry, dict) or not str(entry.get("message") or "").strip():
            continue
        effect = str(entry.get("effect") or "none")
        cleaned[str(action_code)] = {
            "effect": effect if effect in CONSEQUENCE_EFFECTS else "none",
            "message": str(entry["message"]).strip(),
        }
    return cleaned


def validate_runtime_extensions(definition) -> list[str]:
    """Publication problems in the optional parts of a definition."""

    errors = []
    steps = [step for step in definition.get("steps", []) if isinstance(step, dict)]
    step_codes = {step.get("code") for step in steps}
    if definition.get("sequence") not in (None, FREE_SEQUENCE, ORDERED_SEQUENCE):
        errors.append("Scenario sequence must be 'ordered' or 'free'.")
    for index, step in enumerate(steps, start=1):
        choices = normalize_choices(step)
        if choices and step.get("action_code") not in {item["action_code"] for item in choices}:
            errors.append(f"Step {index} choices must include its correct action.")
    for variant in definition.get("variants") or []:
        if not isinstance(variant, dict) or not variant.get("code"):
            errors.append("Every fault case needs a code.")
            continue
        overrides = variant.get("steps")
        if not isinstance(overrides, dict):
            errors.append(f"Fault case {variant['code']!r} must describe the steps it changes.")
            continue
        for step_code in overrides:
            if step_code not in step_codes:
                errors.append(
                    f"Fault case {variant['code']!r} changes {step_code!r}, which is not a step."
                )
    for step in resolved_steps_for_all_variants(definition):
        if step.get("action_code") not in accepted_action_codes(step):
            errors.append(
                f"Step {step.get('code')!r} has a fault case whose correct action is not accepted."
            )
    errors.extend(validate_scene(definition.get("scene")))
    correct_actions = {code for step in steps for code in accepted_action_codes(step)}
    for item in scenario_distractors(definition):
        if item["action_code"] in correct_actions:
            errors.append(
                f"Distractor {item['action_code']!r} is also a correct action, so it cannot be a "
                "distractor."
            )
    check = definition.get("knowledge_check")
    if check is not None:
        raw = check.get("questions") if isinstance(check, dict) else None
        if not isinstance(raw, list) or len(_questions(definition)) != len(raw):
            errors.append("Every knowledge-check question needs a code and at least two options.")
        for question in _questions(definition):
            if str(question.get("answer") or "") not in {
                option["code"] for option in question["options"]
            }:
                errors.append(
                    f"Knowledge-check question {question['code']!r} needs an answer among "
                    "its options."
                )
    return errors


def scenario_distractors(definition) -> list[dict]:
    """Actions that are never right: `distractors`, or a scene's older `extra_actions`."""

    if not isinstance(definition, dict):
        return []
    source = definition.get("distractors")
    if not isinstance(source, list):
        scene = definition.get("scene")
        source = scene.get("extra_actions") if isinstance(scene, dict) else None
    if not isinstance(source, list):
        return []
    return [
        {
            "action_code": str(item.get("action_code")),
            "label": str(item.get("label") or item.get("action_code")),
        }
        for item in source
        if isinstance(item, dict) and item.get("action_code")
    ]


def validate_scene(scene) -> list[str]:
    """Structural problems in an authored scene: unknown props, bad bindings, bad effects."""

    if scene is None:
        return []
    if not isinstance(scene, dict):
        return ["The scene must be an object."]
    errors = []
    props = scene.get("props")
    if not isinstance(props, list) or not props:
        return ["The scene needs at least one prop."]
    ids = []
    for index, prop in enumerate(props, start=1):
        if not isinstance(prop, dict) or not str(prop.get("id") or "").strip():
            errors.append(f"Scene prop {index} needs an id.")
            continue
        ids.append(prop["id"])
        position = prop.get("position")
        if not (
            isinstance(position, list)
            and len(position) == 2
            and all(isinstance(value, int | float) for value in position)
        ):
            errors.append(f"Scene prop {prop['id']!r} needs a position of two numbers.")
        if not str(prop.get("kind") or "").strip():
            errors.append(f"Scene prop {prop['id']!r} needs a kind.")
    if len(ids) != len(set(ids)):
        errors.append("Scene prop ids must be unique.")
    known = set(ids)
    bindings = scene.get("bindings", {})
    if not isinstance(bindings, dict):
        return [*errors, "Scene bindings must be an object."]
    tools = {
        binding.get("tool")
        for binding in bindings.values()
        if isinstance(binding, dict) and binding.get("tool")
    }
    for part, binding in bindings.items():
        prop_id = str(part).split(".")[0]
        if prop_id not in known:
            errors.append(f"Scene binding {part!r} refers to a prop that is not in the scene.")
        if not isinstance(binding, dict) or not ({"action", "tool", "accepts"} & set(binding)):
            errors.append(f"Scene binding {part!r} needs an action, a tool or what it accepts.")
            continue
        accepts = binding.get("accepts")
        if accepts is not None:
            if not isinstance(accepts, dict) or not accepts:
                errors.append(f"Scene binding {part!r} must say which tool does what.")
            else:
                for tool in accepts:
                    if tool not in tools:
                        errors.append(
                            f"Scene binding {part!r} accepts {tool!r}, but no part gives that tool."
                        )
    for effect in scene.get("effects") or []:
        if (
            not isinstance(effect, dict)
            or not effect.get("when")
            or not isinstance(effect.get("set"), dict)
        ):
            errors.append("Every scene effect needs 'when' and 'set'.")
            continue
        for prop_id in effect["set"]:
            if prop_id not in known:
                errors.append(f"A scene effect changes {prop_id!r}, which is not in the scene.")
    return errors


def resolved_steps_for_all_variants(definition):
    for variant in scenario_variants(definition):
        if isinstance(variant.get("steps"), dict):
            yield from resolved_steps(definition, variant["code"])
