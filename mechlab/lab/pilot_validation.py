from __future__ import annotations

import re

from django.conf import settings

from .models import (
    AssetPackage,
    Enrollment,
    PilotApproval,
    PilotObservation,
    PilotRehearsal,
    SimulationScenario,
)

REQUIRED_INSTRUMENTS = set(PilotObservation.Instrument.values)
REQUIRED_THRESHOLDS = {
    "susMedianMin",
    "recognitionSuccessRateMin",
    "recognitionMedianLatencyMsMax",
    "completionRateGapMax",
    "meanScoreGapMax",
    "instructorWorkloadMinutesMax",
}
REQUIRED_ANALYSIS_FIELDS = {
    "primaryOutcome",
    "missingDataPolicy",
    "exclusionPolicy",
    "uncertaintyMethod",
}
REQUIRED_START_APPROVALS = {
    PilotApproval.Domain.ETHICS,
    PilotApproval.Domain.PRIVACY,
    PilotApproval.Domain.SAFEGUARDING,
    PilotApproval.Domain.INSTRUCTOR,
    PilotApproval.Domain.SAFETY,
    PilotApproval.Domain.DEVICE,
}


def pilot_freeze_errors(study) -> list[str]:
    errors = []
    if study.scenario.status != SimulationScenario.Status.PUBLISHED:
        errors.append("The scenario must be published.")
    if study.scenario.asset_package_id is None:
        errors.append("The pilot requires a governed production asset package.")
    elif study.scenario.asset_package.status != AssetPackage.Status.PUBLISHED:
        errors.append("The pilot asset package must be published.")
    if not study.cohort.is_active:
        errors.append("The pilot cohort must be active.")
    if not Enrollment.objects.filter(
        cohort=study.cohort,
        status=Enrollment.Status.ACTIVE,
    ).exists():
        errors.append("The pilot cohort requires at least one active learner.")
    if study.consent_version != settings.RESEARCH_CONSENT_VERSION:
        errors.append("The pilot consent version must match the configured current consent.")
    missing_instruments = sorted(REQUIRED_INSTRUMENTS - set(study.instruments))
    if missing_instruments:
        errors.append(f"Instrument definitions are missing: {', '.join(missing_instruments)}.")
    for code, definition in study.instruments.items():
        if not isinstance(definition, dict):
            errors.append(f"Instrument {code} requires a versioned definition.")
            continue
        version = str(definition.get("version", "")).strip()
        evidence_reference = str(definition.get("evidenceReference", "")).strip()
        content_sha256 = str(definition.get("contentSha256", "")).strip()
        if (
            not version
            or not evidence_reference
            or version.lower().startswith("replace")
            or evidence_reference.lower().startswith("replace")
            or not re.fullmatch(r"[0-9a-f]{64}", content_sha256)
            or content_sha256 == "0" * 64
        ):
            errors.append(
                f"Instrument {code} requires an approved version, controlled evidence reference, "
                "and non-placeholder SHA-256."
            )
    if not study.supported_devices:
        errors.append("At least one supported physical device profile is required.")
    else:
        required_device_fields = {"model", "os", "browser", "tier", "supported"}
        for index, device in enumerate(study.supported_devices, start=1):
            if not isinstance(device, dict) or not required_device_fields.issubset(device):
                errors.append(f"Device profile {index} is incomplete.")
            elif any(
                not str(device.get(key, "")).strip()
                or str(device.get(key, "")).lower().startswith("replace")
                for key in ["model", "os", "browser", "tier"]
            ):
                errors.append(f"Device profile {index} contains placeholder values.")
        if not any(
            isinstance(device, dict) and device.get("supported") is True
            for device in study.supported_devices
        ):
            errors.append("At least one device profile must be explicitly supported.")
        if not any(
            isinstance(device, dict) and device.get("supported") is False
            for device in study.supported_devices
        ):
            errors.append("At least one unsupported profile is required for fallback testing.")
    missing_analysis = sorted(REQUIRED_ANALYSIS_FIELDS - set(study.analysis_plan))
    if missing_analysis:
        errors.append(f"Analysis-plan fields are missing: {', '.join(missing_analysis)}.")
    missing_thresholds = sorted(REQUIRED_THRESHOLDS - set(study.thresholds))
    if missing_thresholds:
        errors.append(f"Success thresholds are missing: {', '.join(missing_thresholds)}.")
    for key in REQUIRED_THRESHOLDS & set(study.thresholds):
        value = study.thresholds[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
            errors.append(f"Threshold {key} must be a non-negative number.")
    for key in ["recognitionSuccessRateMin", "completionRateGapMax"]:
        if isinstance(study.thresholds.get(key), (int, float)) and study.thresholds[key] > 1:
            errors.append(f"Threshold {key} must not exceed 1.")
    if (
        isinstance(study.thresholds.get("susMedianMin"), (int, float))
        and study.thresholds["susMedianMin"] > 100
    ):
        errors.append("Threshold susMedianMin must not exceed 100.")
    return errors


def pilot_collection_errors(study) -> list[str]:
    errors = []
    if settings.RESEARCH_CONSENT_STATUS != "approved":
        errors.append("The configured research consent policy is not approved.")
    if study.consent_version != settings.RESEARCH_CONSENT_VERSION:
        errors.append("The frozen pilot consent is no longer the configured current version.")
    approvals = {item.domain: item.status for item in study.approvals.all()}
    missing_approvals = sorted(
        domain for domain in REQUIRED_START_APPROVALS if approvals.get(domain) != "approved"
    )
    if missing_approvals:
        errors.append(f"Required approvals are missing: {', '.join(missing_approvals)}.")
    # Preserve every rehearsal run and use the latest completed result for each kind.
    rehearsals = {
        item.kind: item.outcome for item in study.rehearsals.order_by("completed_at", "created_at")
    }
    missing_rehearsals = sorted(
        kind for kind in PilotRehearsal.Kind.values if rehearsals.get(kind) != "pass"
    )
    if missing_rehearsals:
        errors.append(f"Passed rehearsals are missing: {', '.join(missing_rehearsals)}.")
    if study.incidents.filter(status="open", severity__in=["high", "critical"]).exists():
        errors.append("High or critical rehearsal incidents remain open.")
    return errors


def build_protocol_snapshot(study) -> dict:
    scenario = study.scenario
    asset = scenario.asset_package
    return {
        "pilot": {
            "code": study.code,
            "protocolVersion": study.protocol_version,
            "consentVersion": study.consent_version,
            "schoolCode": study.school.code,
            "cohortCode": study.cohort.code,
        },
        "scenario": {
            "id": scenario.pk,
            "version": scenario.version,
            "definition": scenario.definition,
            "gradingPolicy": {
                "id": scenario.grading_policy_id,
                "version": scenario.grading_policy.version,
                "algorithm": scenario.grading_policy.algorithm,
                "baseScore": scenario.grading_policy.base_score,
                "passThreshold": scenario.grading_policy.pass_threshold,
                "incorrectActionPenalty": scenario.grading_policy.incorrect_action_penalty,
                "safetyCriticalPenalty": scenario.grading_policy.safety_critical_penalty,
                "requiresReviewOnSafetyError": (
                    scenario.grading_policy.requires_review_on_safety_error
                ),
                "rules": scenario.grading_policy.rules,
            },
            "assetPackage": {
                "id": asset.pk,
                "code": asset.code,
                "version": asset.version,
                "sha256": asset.sha256,
                "manifest": asset.manifest,
            },
        },
        "instruments": study.instruments,
        "supportedDevices": study.supported_devices,
        "analysisPlan": study.analysis_plan,
        "thresholds": study.thresholds,
    }
