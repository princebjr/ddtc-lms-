# DDTC LMS: Production readiness and runbook

Extract of `docs/BUILD_PLAN.md` v1.7. If this file and BUILD_PLAN.md ever differ, BUILD_PLAN.md wins; report the conflict.

## 13. Production readiness, privacy and operational controls

Before production release, the team must complete and document all of the following:

- Privacy/legal review of data collected, purpose, access, retention, correction requests, account deactivation, security incidents, backups and any legally required erasure/anonymization. DDTC's responsible adviser determines applicable Ghanaian and other relevant legal obligations; developers must not invent legal conclusions.
- A documented retention schedule by data class: account/profile data, authentication data, academic records, submissions, audio files, audit/security logs, notifications, backups and temporary uploads. Exceptions/holds must be supported and audited.
- RPO, RTO, backup retention and restoration test cadence per D34, or DDTC-approved alternatives. Backups are encrypted and access-restricted; restore checks verify both database rows and Storage objects.
- Security incident response: detection, triage, containment, evidence preservation, responsible contacts, communication and recovery. Do not expose secrets or sensitive learner data in logs.
- Operational monitoring/alerts for availability, server errors, repeated auth failures, email queue failures, upload validation/cleanup failures, backup failures, storage quota, scheduled jobs and retention failures.
- Production rollback procedure covering frontend deployment, database migration compatibility, configuration rollback and feature disablement. Destructive migrations require a tested backup and explicit approval.
- No production credentials or personal learner data in source control, sample fixtures, CI logs, screenshots or development seed data.

## Runbook contents to write in Phase 14

- Backup and restore for database and files, with the quarterly restore drill.
- Adding a lecturer, changing settings, enabling and disabling retention.
- Administrator MFA reset and the second-administrator recovery procedure.
- Google OAuth: where the client IDs and secrets live, how to rotate them, how to check the consent screen is In production.
- Incident contacts and escalation; rollback steps for a bad release.
