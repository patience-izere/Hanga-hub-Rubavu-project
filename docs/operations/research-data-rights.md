# Research consent, retention, withdrawal, and incident workflow

Status: engineering workflow implemented; the school, ethics authority, privacy owner, retention
period, consent text, safeguarding route, and incident contacts still require written approval
before participant recruitment.

## Consent and collection

Research participation is optional and separate from learning or assessment. The API accepts a
survey only when `consent_accepted=true` and the submitted consent version exactly matches
`OPEDU_RESEARCH_CONSENT_VERSION`. Collection is rejected while
`OPEDU_RESEARCH_CONSENT_STATUS=draft`; operations may change it to `approved` only after recording
the institutional approvals named below. It stores a school-scoped HMAC participant code, not the account
name or email, together with the scenario version, consent time, expiry, and response. A stale or
missing consent assertion is rejected. Each accepted or renewed consent creates an audit event.

The approved deployment must preserve the immutable consent text for every released version and
must not change the version variable until the corresponding text, translations, age/guardian
rules, research purpose, recipients, risks, benefits, voluntary nature, and contact route have been
approved.

## Withdrawal and deletion

The learner can withdraw from the evaluation page. Withdrawal immediately deletes that
participant code's research survey responses in the active school and marks the pseudonymous
consent receipt as withdrawn. The receipt contains no direct account identifier and is retained to
prove that the withdrawal was honored. It cannot be edited or deleted through Django admin.

Withdrawal from research does not delete assessment evidence needed by the school. Requests about
operational learning records must follow the separately approved school data-controller process;
an authorized owner must verify identity, legal retention duties, safeguarding constraints, and
the effect on issued results before correction, restriction, export, or deletion.

## Retention expiry

`OPEDU_RESEARCH_RETENTION_DAYS` defines the configured draft retention interval. Operations must
schedule the following command at least daily and alert on failure:

```powershell
python manage.py purge_expired_research
```

The command deletes matching responses transactionally, changes the pseudonymous receipt to
`expired`, and records an audit event. `--dry-run` reports the due count without mutation. Backups
must expire consistently with the institution's approved schedule; application deletion alone does
not prove backup deletion.

## Access and incident handling

Learners can submit or withdraw only their own pseudonymized responses. Only active instructors or
school administrators can list responses, and queries remain school scoped. Research exports omit
account identifiers. Platform administrators must use audited break-glass access only under the
approved operational policy.

For suspected disclosure, invalid consent, unsafe research practice, lost data, or cross-school
access: stop collection, preserve request IDs and audit evidence, notify the named safeguarding and
privacy owners, contain access without destroying evidence, assess notification duties, document
the decision, and resume only after written authorization. Do not place camera frames, credentials,
names, emails, free-text incident details, or raw device fingerprints in routine telemetry.

## Approval record required before pilot

Record the data controller, processor(s), lawful basis, ethics reference, consent owner, language
owners, retention duration, backup expiry, withdrawal contact, safeguarding lead, security contact,
incident notification window, cross-border locations, and approval signatures in the controlled
pilot release record. Repository tests prove software behavior only; they do not constitute legal,
ethics, privacy, or safeguarding approval.
