# Production backup and restore

Backups must survive total loss of the VPS. Store them in an encrypted offsite bucket owned separately
from the production MinIO service, retain 14 daily recovery points, and alert when a scheduled backup
does not complete.

## Backup policy

- PostgreSQL: daily logical backup in custom `pg_dump` format, including migration history.
- Object storage: daily versioned or incremental copy of the QHSE document bucket.
- Redis: enable persistence for queue recovery, but do not treat Redis snapshots as authoritative
  backups. Jobs and locks are operational data; PostgreSQL and stored documents are sources of truth.
- Encrypt data in transit and at rest. Restrict the backup identity to writing backup objects and
  reading only during an approved restore.
- Expire recovery points after 14 days only after a newer successful backup has been verified.

Use Dokploy's scheduled database backup capability when it can target the independent offsite bucket.
Otherwise schedule `pg_dump` from a locked-down backup container or host account. Use an S3-compatible
client such as `mc mirror` for document data. Keep credentials out of command history and repository
files.

## Verification

After every backup, record the timestamp, non-zero size, checksum, PostgreSQL server version, and source
deployment. Alert on missing, empty, or unexpectedly small artifacts.

Once per month:

1. Create an isolated PostgreSQL database and object-storage bucket that are not reachable by production.
2. Restore the newest database backup with `pg_restore` and mirror the document objects into the test
   bucket.
3. Run committed Prisma migrations to confirm the restored schema reaches the current version.
4. Start the API and worker against the restored services, check both readiness endpoints, retrieve a
   representative stored document, and verify a representative queued workflow.
5. Record recovery time, restored backup timestamp, validation results, and cleanup confirmation.

Never test restoration over the production database or bucket. A failed restore drill is an operational
incident: retain the affected backups, investigate immediately, and do not wait for the next monthly run.
