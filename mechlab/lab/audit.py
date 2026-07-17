from .models import AuditEvent


def record_audit_event(
    *,
    event_type: str,
    actor=None,
    school=None,
    target=None,
    payload: dict | None = None,
) -> AuditEvent:
    return AuditEvent.objects.create(
        event_type=event_type,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        school=school,
        target_type=target._meta.label_lower if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        payload=payload or {},
    )
