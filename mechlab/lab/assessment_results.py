"""Deterministically materialize immutable assessment results from attempt events."""

from collections import defaultdict
from decimal import Decimal

from .models import Attempt, Competency, CompetencyResult, StepResult


def materialize_attempt_results(attempt, steps, events):
    events_by_step = defaultdict(list)
    for event in events:
        step_code = event.payload.get("stepCode") or event.payload.get("expectedStepCode")
        if step_code:
            events_by_step[step_code].append(event)

    step_results = {}
    all_competency_codes = {
        competency["code"] for competency in attempt.scenario.definition.get("competencies", [])
    }
    for step in steps:
        step_events = events_by_step[step["code"]]
        incorrect = [
            event
            for event in step_events
            if event.event_type in {"incorrect_action", "tolerance_failed"}
        ]
        hints = [event for event in step_events if event.event_type == "hint_used"]
        completions = [event for event in step_events if event.event_type == "step_completed"]
        safety_violations = sum(event.payload.get("safetyCritical") is True for event in incorrect)
        available_points = Decimal(step.get("points", 10))
        event_penalty = Decimal(
            sum(
                attempt.grading_policy.safety_critical_penalty
                if event.payload.get("safetyCritical") is True
                else attempt.grading_policy.incorrect_action_penalty
                for event in incorrect
            )
        )
        hint_penalty = Decimal(sum(int(event.payload.get("pointsPenalty", 0)) for event in hints))
        achieved_points = max(Decimal(0), available_points - event_penalty - hint_penalty)
        evidence_sequences = [event.sequence for event in step_events]
        started_at = step_events[0].occurred_at if step_events else attempt.started_at
        completed_at = completions[-1].occurred_at if completions else attempt.completed_at
        duration_seconds = max(0, int((completed_at - started_at).total_seconds()))
        has_tolerance = bool(step.get("tolerances"))
        tolerance_passed = (
            not any(event.event_type == "tolerance_failed" for event in incorrect)
            if has_tolerance
            else None
        )
        outcome = (
            StepResult.Outcome.REQUIRES_REVIEW
            if safety_violations and attempt.grading_policy.requires_review_on_safety_error
            else StepResult.Outcome.PASSED
            if completions
            else StepResult.Outcome.FAILED
        )
        result = StepResult.objects.create(
            attempt=attempt,
            step_code=step["code"],
            outcome=outcome,
            attempts_count=len(incorrect) + len(completions),
            hints_used=len(hints),
            duration_seconds=duration_seconds,
            achieved_points=achieved_points,
            available_points=available_points,
            tolerance_passed=tolerance_passed,
            safety_violations=safety_violations,
            evidence_sequences=evidence_sequences,
            completed_at=completed_at,
        )
        step_results[step["code"]] = result

    competency_snapshots = attempt.scenario.definition.get("competencies", [])
    competency_by_code = {
        competency.code: competency
        for competency in Competency.objects.filter(
            course=attempt.assignment.lesson.course,
            code__in=[item["code"] for item in competency_snapshots],
        )
    }
    competency_results = []
    for snapshot in competency_snapshots:
        competency = competency_by_code.get(snapshot["code"])
        if competency is None:
            continue
        relevant_steps = [
            step
            for step in steps
            if snapshot["code"] in (step.get("competency_codes") or all_competency_codes)
        ]
        relevant_results = [step_results[step["code"]] for step in relevant_steps]
        available_points = sum(
            (result.available_points for result in relevant_results),
            Decimal(0),
        )
        achieved_points = sum(
            (result.achieved_points for result in relevant_results),
            Decimal(0),
        )
        percentage = (
            (achieved_points / available_points * Decimal(100)).quantize(Decimal("0.01"))
            if available_points
            else Decimal(0)
        )
        threshold = int(snapshot.get("mastery_threshold", competency.mastery_threshold))
        requires_review = any(
            result.outcome == StepResult.Outcome.REQUIRES_REVIEW for result in relevant_results
        )
        mastery_state = (
            CompetencyResult.MasteryState.REQUIRES_REVIEW
            if requires_review
            else CompetencyResult.MasteryState.MASTERED
            if percentage >= threshold
            else CompetencyResult.MasteryState.DEVELOPING
            if available_points
            else CompetencyResult.MasteryState.NOT_DEMONSTRATED
        )
        competency_results.append(
            CompetencyResult.objects.create(
                attempt=attempt,
                competency=competency,
                competency_code=competency.code,
                achieved_points=achieved_points,
                available_points=available_points,
                mastery_percentage=percentage,
                mastery_threshold=threshold,
                mastery_state=mastery_state,
                evidence=[
                    {
                        "stepCode": result.step_code,
                        "stepResultId": result.pk,
                        "eventSequences": result.evidence_sequences,
                    }
                    for result in relevant_results
                ],
            )
        )

    if attempt.status == Attempt.Status.REQUIRES_REVIEW:
        return Attempt.Outcome.REQUIRES_REVIEW
    if (
        competency_results
        and all(
            result.mastery_state == CompetencyResult.MasteryState.MASTERED
            for result in competency_results
        )
        and attempt.score >= attempt.grading_policy.pass_threshold
    ):
        return Attempt.Outcome.MASTERED
    if attempt.score >= attempt.grading_policy.pass_threshold:
        return Attempt.Outcome.PASSED
    return Attempt.Outcome.FAILED
