from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict

from .models import Attempt, Enrollment, PilotApproval, PilotObservation
from .pilot_instruments import sus_score
from .research import research_participant_code

T_CRITICAL_975 = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
}


def _mean(values):
    return round(statistics.mean(values), 3) if values else None


def _median(values):
    return round(statistics.median(values), 3) if values else None


def _rate(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None


def _paired_change(pre_by_code, post_by_code):
    codes = sorted(set(pre_by_code) & set(post_by_code))
    differences = [post_by_code[code] - pre_by_code[code] for code in codes]
    result = {
        "pairedN": len(codes),
        "preMean": _mean([pre_by_code[code] for code in codes]),
        "postMean": _mean([post_by_code[code] for code in codes]),
        "meanChange": _mean(differences),
        "normalizedGainMean": _mean(
            [
                (post_by_code[code] - pre_by_code[code]) / (100 - pre_by_code[code])
                for code in codes
                if pre_by_code[code] < 100
            ]
        ),
        "cohensDz": None,
        "meanChange95Ci": None,
    }
    if len(differences) >= 2:
        standard_deviation = statistics.stdev(differences)
        if standard_deviation:
            result["cohensDz"] = round(statistics.mean(differences) / standard_deviation, 3)
        critical = T_CRITICAL_975.get(len(differences) - 1, 1.96)
        margin = critical * standard_deviation / math.sqrt(len(differences))
        result["meanChange95Ci"] = [
            round(statistics.mean(differences) - margin, 3),
            round(statistics.mean(differences) + margin, 3),
        ]
    return result


def _cronbach_alpha(rows):
    if len(rows) < 2 or not rows or len(rows[0]) < 2:
        return None
    item_count = len(rows[0])
    if any(len(row) != item_count for row in rows):
        return None
    totals = [sum(row) for row in rows]
    total_variance = statistics.variance(totals)
    if not total_variance:
        return None
    item_variances = sum(
        statistics.variance([row[index] for row in rows]) for index in range(item_count)
    )
    return round(item_count / (item_count - 1) * (1 - item_variances / total_variance), 3)


def _gate(value, *, passed=None, reason=""):
    if value is None:
        return {"status": "insufficient", "value": None, "reason": reason or "Evidence is missing."}
    return {"status": "pass" if passed else "fail", "value": value, "reason": reason}


def build_pilot_report(study):
    learner_ids = list(
        Enrollment.objects.filter(
            cohort=study.cohort,
            status=Enrollment.Status.ACTIVE,
        ).values_list("learner_id", flat=True)
    )
    expected_codes = {
        research_participant_code(study.school_id, learner_id) for learner_id in learner_ids
    }
    observations = list(study.observations.all())
    by_instrument = defaultdict(list)
    for observation in observations:
        by_instrument[observation.instrument].append(observation)

    pre = {
        item.participant_code: item.responses["score"]
        for item in by_instrument[PilotObservation.Instrument.PRE_TEST]
    }
    post = {
        item.participant_code: item.responses["score"]
        for item in by_instrument[PilotObservation.Instrument.POST_TEST]
    }
    learning = _paired_change(pre, post)

    sus_rows = [item.responses["items"] for item in by_instrument[PilotObservation.Instrument.SUS]]
    sus_scores = [sus_score(row) for row in sus_rows]
    sus_reliability_rows = [
        [value if index % 2 == 0 else 6 - value for index, value in enumerate(row)]
        for row in sus_rows
    ]
    tam_rows = by_instrument[PilotObservation.Instrument.TAM]
    tam = {
        construct: {
            "mean": _mean([value for item in tam_rows for value in item.responses[construct]]),
            "alpha": _cronbach_alpha([item.responses[construct] for item in tam_rows]),
        }
        for construct in ["usefulness", "ease", "enjoyment", "intention"]
    }

    transfer_rows = by_instrument[PilotObservation.Instrument.TRANSFER]
    transfer = {
        "n": len(transfer_rows),
        "meanRubricScore": _mean(
            [
                statistics.mean(
                    [
                        item.responses[key]
                        for key in ["sequence", "accuracy", "safety", "time", "independence"]
                    ]
                )
                for item in transfer_rows
            ]
        ),
        "criticalSafetyFailures": sum(
            item.responses["criticalSafetyFailure"] for item in transfer_rows
        ),
        "medianDurationSeconds": _median(
            [item.responses["durationSeconds"] for item in transfer_rows]
        ),
    }

    attempts = list(
        Attempt.objects.filter(scenario=study.scenario, learner_id__in=learner_ids)
        .prefetch_related("events", "sync_audits")
        .order_by("learner_id", "started_at")
    )
    renderer = {}
    for mode in Attempt.RendererMode.values:
        mode_attempts = [attempt for attempt in attempts if attempt.renderer_mode == mode]
        completed = [
            attempt for attempt in mode_attempts if attempt.status == Attempt.Status.COMPLETED
        ]
        renderer[mode] = {
            "started": len(mode_attempts),
            "completed": len(completed),
            "completionRate": _rate(len(completed), len(mode_attempts)),
            "meanScore": _mean(
                [float(attempt.score) for attempt in completed if attempt.score is not None]
            ),
        }

    completed_rates = [
        item["completionRate"] for item in renderer.values() if item["completionRate"] is not None
    ]
    completion_gap = (
        round(max(completed_rates) - min(completed_rates), 4) if len(completed_rates) >= 2 else None
    )

    def summarize_attempt_group(group_attempts):
        completed = [item for item in group_attempts if item.status == Attempt.Status.COMPLETED]
        return {
            "started": len(group_attempts),
            "completed": len(completed),
            "completionRate": _rate(len(completed), len(group_attempts)),
            "meanScore": _mean([float(item.score) for item in completed if item.score is not None]),
            "outcomes": dict(Counter(item.outcome for item in group_attempts)),
        }

    ar_attempts = [
        item
        for item in attempts
        if item.renderer_mode
        in {Attempt.RendererMode.MARKER_AR, Attempt.RendererMode.MARKERLESS_AR}
    ]
    fallback_attempts = [
        item
        for item in attempts
        if item.renderer_mode
        in {Attempt.RendererMode.ACCESSIBLE_2D, Attempt.RendererMode.DESKTOP_3D}
    ]
    mode_groups = {
        "ar": summarize_attempt_group(ar_attempts),
        "fallback": summarize_attempt_group(fallback_attempts),
    }
    group_rates = [mode_groups[key]["completionRate"] for key in ["ar", "fallback"]]
    ar_fallback_completion_gap = (
        round(abs(group_rates[0] - group_rates[1]), 4)
        if all(value is not None for value in group_rates)
        else None
    )
    group_scores = [mode_groups[key]["meanScore"] for key in ["ar", "fallback"]]
    ar_fallback_score_gap = (
        round(abs(group_scores[0] - group_scores[1]), 3)
        if all(value is not None for value in group_scores)
        else None
    )

    events = [event for attempt in attempts for event in attempt.events.all()]
    offline_attempt_ids = {
        attempt.pk
        for attempt in attempts
        if any(
            event.payload.get("metadata", {}).get("synchronizedFromOutbox") is True
            for event in attempt.events.all()
            if isinstance(event.payload.get("metadata", {}), dict)
        )
    }
    passed_sync_attempt_ids = {
        attempt.pk
        for attempt in attempts
        if attempt.pk in offline_attempt_ids
        and any(audit.passed for audit in attempt.sync_audits.all())
    }
    sync_missing_events = sum(
        len(audit.missing_event_ids) for attempt in attempts for audit in attempt.sync_audits.all()
    )
    found = [event for event in events if event.event_type == "ar_marker_found"]
    mismatches = [event for event in events if event.event_type == "ar_marker_mismatch"]
    recognition_latencies = [
        event.payload["recognitionLatencyMs"]
        for event in found
        if isinstance(event.payload.get("recognitionLatencyMs"), (int, float))
    ]
    recognition = {
        "found": len(found),
        "mismatches": len(mismatches),
        "falsePlacements": len(mismatches),
        "successRate": _rate(len(found), len(found) + len(mismatches)),
        "medianLatencyMs": _median(recognition_latencies),
        "trackingLoss": sum(event.event_type == "ar_marker_lost" for event in events),
        "rescans": max(0, len(found) - len({event.attempt_id for event in found})),
        "fallbacks": sum(event.event_type == "ar_fallback_used" for event in events),
    }

    device_tiers = {}
    for tier in sorted(
        {str(attempt.capability_profile.get("deviceTier", "unclassified")) for attempt in attempts}
    ):
        tier_attempts = [
            attempt
            for attempt in attempts
            if str(attempt.capability_profile.get("deviceTier", "unclassified")) == tier
        ]
        tier_attempt_ids = {attempt.pk for attempt in tier_attempts}
        tier_events = [event for event in events if event.attempt_id in tier_attempt_ids]
        tier_found = [event for event in tier_events if event.event_type == "ar_marker_found"]
        tier_mismatches = [
            event for event in tier_events if event.event_type == "ar_marker_mismatch"
        ]
        tier_latencies = [
            event.payload["recognitionLatencyMs"]
            for event in tier_found
            if isinstance(event.payload.get("recognitionLatencyMs"), (int, float))
        ]
        tier_summary = summarize_attempt_group(tier_attempts)
        tier_summary.update(
            {
                "recognitionSuccessRate": _rate(
                    len(tier_found), len(tier_found) + len(tier_mismatches)
                ),
                "falsePlacements": len(tier_mismatches),
                "medianRecognitionLatencyMs": _median(tier_latencies),
                "trackingLoss": sum(event.event_type == "ar_marker_lost" for event in tier_events),
                "rescans": max(
                    0,
                    len(tier_found) - len({event.attempt_id for event in tier_found}),
                ),
                "fallbacks": sum(event.event_type == "ar_fallback_used" for event in tier_events),
                "medianStorageAvailableMb": _median(
                    [
                        attempt.capability_profile["storageAvailableMb"]
                        for attempt in tier_attempts
                        if isinstance(
                            attempt.capability_profile.get("storageAvailableMb"), (int, float)
                        )
                    ]
                ),
            }
        )
        device_tiers[tier] = tier_summary

    workload_rows = by_instrument[PilotObservation.Instrument.INSTRUCTOR_WORKLOAD]
    workload_totals = [
        item.responses["preparationMinutes"] + item.responses["supportMinutes"]
        for item in workload_rows
    ]
    operations = {
        "assetLoadFailures": sum(event.event_type == "asset_load_failed" for event in events),
        "syncFailureSignals": sum(
            event.event_type == "sync_state_changed" and event.payload.get("state") == "failed"
            for event in events
        ),
        "offlineAttempts": len(offline_attempt_ids),
        "reconciledOfflineAttempts": len(passed_sync_attempt_ids),
        "syncAuditMissingEvents": sync_missing_events,
        "lowFrameRateSamples": sum(
            event.event_type == "performance_sample"
            and isinstance(event.payload.get("framesPerSecond"), (int, float))
            and event.payload["framesPerSecond"] < 24
            for event in events
        ),
        "workloadN": len(workload_rows),
        "medianWorkloadMinutes": _median(workload_totals),
        "workloadAccepted": bool(workload_rows)
        and all(item.responses["acceptable"] for item in workload_rows),
        "supportIncidents": sum(item.responses["supportIncidents"] for item in workload_rows),
        "downloads": sum(item.responses.get("downloads", 0) for item in workload_rows),
        "downloadFailures": sum(
            item.responses.get("downloadFailures", 0) for item in workload_rows
        ),
        "crashes": sum(item.responses.get("crashCount", 0) for item in workload_rows),
        "storageUsedMb": sum(item.responses.get("storageUsedMb", 0) for item in workload_rows),
        "synchronizationIncidents": sum(
            item.responses.get("synchronizationIncidents", 0) for item in workload_rows
        ),
        "technicalIncidents": study.incidents.filter(kind="technical").count(),
    }

    themes = Counter(
        theme
        for instrument in [
            PilotObservation.Instrument.LEARNER_INTERVIEW,
            PilotObservation.Instrument.INSTRUCTOR_INTERVIEW,
        ]
        for item in by_instrument[instrument]
        for theme in item.responses["themes"]
    )
    unresolved_safety = (
        study.incidents.filter(safety_critical=True).exclude(status="resolved").count()
    )
    ar_penalties = study.incidents.filter(ar_caused_grading_penalty=True).count()
    thresholds = study.thresholds
    approvals = {approval.domain: approval.status for approval in study.approvals.all()}
    required_approvals = set(PilotApproval.Domain.values)

    gates = {
        "safety": _gate(
            unresolved_safety + ar_penalties,
            passed=unresolved_safety == 0 and ar_penalties == 0,
            reason="Must have no unresolved safety-critical incident or AR-caused grading penalty.",
        ),
        "sus": _gate(
            _median(sus_scores),
            passed=bool(sus_scores) and _median(sus_scores) >= thresholds.get("susMedianMin", 70),
            reason=f"Median SUS must be at least {thresholds.get('susMedianMin', 70)}.",
        ),
        "recognitionSuccess": _gate(
            recognition["successRate"],
            passed=recognition["successRate"] is not None
            and recognition["successRate"] >= thresholds.get("recognitionSuccessRateMin", 0),
            reason="Recognition success must meet the frozen protocol threshold.",
        ),
        "recognitionLatency": _gate(
            recognition["medianLatencyMs"],
            passed=recognition["medianLatencyMs"] is not None
            and recognition["medianLatencyMs"]
            <= thresholds.get("recognitionMedianLatencyMsMax", 0),
            reason="Recognition latency must meet the frozen protocol threshold.",
        ),
        "rendererParity": _gate(
            (
                {
                    "completionRateGap": ar_fallback_completion_gap,
                    "meanScoreGap": ar_fallback_score_gap,
                }
                if ar_fallback_completion_gap is not None and ar_fallback_score_gap is not None
                else None
            ),
            passed=ar_fallback_completion_gap is not None
            and ar_fallback_score_gap is not None
            and ar_fallback_completion_gap <= thresholds.get("completionRateGapMax", 0)
            and ar_fallback_score_gap <= thresholds.get("meanScoreGapMax", 0),
            reason=(
                "AR and fallback completion-rate and mean-score differences must meet the frozen "
                "parity thresholds."
            ),
        ),
        "offlineSync": _gate(
            len(passed_sync_attempt_ids) if offline_attempt_ids else None,
            passed=bool(offline_attempt_ids)
            and offline_attempt_ids == passed_sync_attempt_ids
            and operations["syncFailureSignals"] == 0
            and sync_missing_events == 0,
            reason=(
                "Every real offline attempt must have a passed UUID reconciliation, zero pending or "
                "missing events, and no failed synchronization signal."
            ),
        ),
        "workload": _gate(
            operations["medianWorkloadMinutes"],
            passed=operations["medianWorkloadMinutes"] is not None
            and operations["medianWorkloadMinutes"]
            <= thresholds.get("instructorWorkloadMinutesMax", 0)
            and operations["workloadAccepted"],
            reason="Instructor workload must meet the frozen limit and be accepted by the school.",
        ),
        "approvals": _gate(
            len([domain for domain in required_approvals if approvals.get(domain) == "approved"]),
            passed=all(approvals.get(domain) == "approved" for domain in required_approvals),
            reason=f"All {len(required_approvals)} named approval domains must be approved.",
        ),
    }

    instrument_counts = {
        instrument: len(by_instrument[instrument])
        for instrument in PilotObservation.Instrument.values
    }
    missing = {
        instrument: max(0, len(expected_codes) - instrument_counts[instrument])
        for instrument in [
            PilotObservation.Instrument.PRE_TEST,
            PilotObservation.Instrument.POST_TEST,
            PilotObservation.Instrument.TRANSFER,
            PilotObservation.Instrument.SUS,
            PilotObservation.Instrument.TAM,
            PilotObservation.Instrument.LEARNER_INTERVIEW,
        ]
    }
    gate_values = list(gates.values())
    return {
        "studyId": study.pk,
        "protocolVersion": study.protocol_version,
        "status": study.status,
        "expectedParticipants": len(expected_codes),
        "observedParticipants": len({item.participant_code for item in observations}),
        "instrumentCounts": instrument_counts,
        "missingByInstrument": missing,
        "learning": learning,
        "transfer": transfer,
        "acceptance": {
            "susN": len(sus_scores),
            "susMedian": _median(sus_scores),
            "susMean": _mean(sus_scores),
            "susAlpha": _cronbach_alpha(sus_reliability_rows),
            "tam": tam,
        },
        "rendererParity": {
            "groups": renderer,
            "completionRateGap": completion_gap,
            "arVsFallback": {
                "groups": mode_groups,
                "completionRateGap": ar_fallback_completion_gap,
                "meanScoreGap": ar_fallback_score_gap,
            },
        },
        "recognition": recognition,
        "byDeviceTier": device_tiers,
        "operations": operations,
        "qualitativeThemes": dict(themes.most_common()),
        "incidents": {
            "total": study.incidents.count(),
            "unresolvedSafetyCritical": unresolved_safety,
            "arCausedGradingPenalties": ar_penalties,
        },
        "excludedRecords": {"count": 0, "reasons": []},
        "gates": gates,
        "overallGate": (
            "pass"
            if gate_values and all(item["status"] == "pass" for item in gate_values)
            else "insufficient"
            if any(item["status"] == "insufficient" for item in gate_values)
            else "fail"
        ),
        "limitations": [
            "Small-sample estimates and confidence intervals must be interpreted with the frozen analysis plan.",
            "Recognition telemetry is reported separately from learner competency and never changes grading.",
            "Missing observations are reported, not silently excluded.",
        ],
    }
