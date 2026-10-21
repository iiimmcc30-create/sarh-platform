# Backup and restore runbook

PostgreSQL logical dumps live on the data server. A copy of that dump, and a
copy of the media host's config, go to an S3-compatible bucket encrypted with
either [age](https://github.com/FiloSottile/age) or an rclone crypt remote.
Failure mail goes to **sarh@getsarh.com** (override with `ALERT_EMAIL_TO`).

This runbook is the setup and restore procedure. Installing the cron on a
server is an operator step; a dry-run in CI does not mean the job has run
against production.

## What is copied

| Host | Script | Contents |
|------|--------|----------|
| Data server | `scripts/data-server/backup-postgres.sh` | `pg_dump` custom format of the Sarh database, plus a sha256 sidecar |
| Data server | `scripts/data-server/backup-offsite.sh` | That dump, encrypted, in the bucket |
| Media host | `scripts/media-server/backup-media-config.sh` | `/opt/sarh-media`: compose file, `livekit.yaml`, Caddyfile, Caddy data/certs, `.env.media` |

Media **files** (LiveKit recordings, uploaded objects in Cloudinary/S3) are not
in this archive. The bucket receives config and certificates only.

## 1. Bucket and rclone

Create a bucket on Backblaze B2, Cloudflare R2, or Contabo Object Storage.
On the server (not in git):

```bash
rclone config
```

For B2, R2, or Contabo, add an S3-compatible remote (R2 and Contabo use the
S3 provider; B2 has its own). Two encryption choices:

**age (recommended when the bucket remote is plain S3).** On a trusted
machine:

```bash
age-keygen -o /root/sarh-backup-age.key
age-keygen -y /root/sarh-backup-age.key
```

Put the `age1...` public recipient in the server env as `BACKUP_AGE_RECIPIENT`.
Keep the secret identity **off** the server that creates backups, and store a
second copy with the people who would restore. Install `age` on both the
backup host and the restore host (`apt install age` or the upstream binary).

**rclone crypt.** Create a second remote of type `crypt` wrapping the bucket
remote. Set `BACKUP_RCLONE_CRYPT=1` and point `RCLONE_REMOTE` at the crypt
remote. Store the crypt password with the age key, not only on the server.

Do not set both age and a crypt remote unless you intend to encrypt twice.

## 2. Environment

On the data server, in `/opt/sarh/.env.data` (values are examples):

```bash
BACKUP_DIR=/opt/backups/sarh/postgres
RETENTION_DAYS=14
BACKUP_MIN_KEEP=7

RCLONE_REMOTE=b2:sarh-backups
BACKUP_OFFSITE_PREFIX=postgres
BACKUP_OFFSITE_RETENTION_DAYS=30
BACKUP_OFFSITE_MIN_KEEP=7
BACKUP_AGE_RECIPIENT=age1xxxxxxxx

ALERT_EMAIL_TO=sarh@getsarh.com
SMTP_HOST=smtp.example.net
SMTP_PORT=587
SMTP_USER=sarh@getsarh.com
SMTP_PASS=replace-me
SMTP_FROM=sarh@getsarh.com
```

`SMTP_FROM` falls back to `EMAIL_FROM`, then `sarh@getsarh.com`.
Telegram is not used unless `BACKUP_ALERT_TELEGRAM=1` and both
`TELEGRAM_ALERT_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` are set.

The media host reads the same off-site and SMTP variables from
`/opt/sarh-media/.env.media`. Its object prefix defaults to `media-config`.

## 3. Install cron

From a checkout at `/opt/sarh` on the data server, as root:

```bash
./scripts/data-server/install-backup-cron.sh
```

On the media host:

```bash
SARH_ROOT=/opt/sarh ./scripts/media-server/install-backup-cron.sh
```

Both scripts are idempotent: they replace only the marked block and leave
other crontab lines in place. Running them again does not duplicate jobs.

Schedule (server local time):

- 03:15 daily — dump, then encrypted upload (`run-backup-job.sh`)
- 04:30 Sunday — restore drill (`run-restore-drill.sh`)
- 03:20 daily on the media host — config archive upload

Logs: `/var/log/sarh-backup.log`, `/var/log/sarh-restore-verify.log`,
`/var/log/sarh-media-backup.log`.

Preview without installing:

```bash
BACKUP_DRY_RUN=1 ./scripts/data-server/install-backup-cron.sh
BACKUP_DRY_RUN=1 RCLONE_REMOTE=b2:sarh BACKUP_AGE_RECIPIENT=age1example \
  ./scripts/data-server/backup-offsite.sh
```

## 4. Failure mail

`run-backup-job.sh` and `run-restore-drill.sh` send one message when the dump,
the upload, the checksum, or the drill exits non-zero. The body is the last
80 lines of that run. If SMTP is missing, the script still exits non-zero and
writes the reason to the log; it does not pretend the alert was sent.

Check a mailbox path without sending:

```bash
BACKUP_DRY_RUN=1 ./scripts/data-server/run-backup-job.sh
```

That dry-run still tries to dump if Docker is up. To exercise only the mail
text, source `scripts/lib/backup-alert.sh` and call `send_backup_alert` with
`BACKUP_DRY_RUN=1`.

## 5. Restore PostgreSQL

1. Pick the dump. On the server, `LATEST.txt` points at the newest local file.
   From the bucket, copy the object back with rclone. For age:

   ```bash
   rclone copyto b2:sarh-backups/postgres/sarh-STAMP.dump.age /tmp/sarh-STAMP.dump.age
   sha256sum -c /tmp/sarh-STAMP.dump.age.sha256
   age -d -i /root/sarh-backup-age.key -o /tmp/sarh-STAMP.dump /tmp/sarh-STAMP.dump.age
   ```

   For a crypt remote, `rclone copyto` writes the decrypted dump. Compare it
   to the sha256 sidecar that `backup-postgres.sh` stored beside the dump
   (`sarh-STAMP.dump.sha256`) if you still have it, or to the checksum you
   recorded when the dump was taken.

2. Prove the dump restores **before** pointing production at it:

   ```bash
   ./scripts/data-server/restore-verify.sh /tmp/sarh-STAMP.dump
   ```

   This starts a throwaway Postgres container with `--network none` and does
   not touch the live database. The weekly drill is the same script with
   `--compare-live`.

3. Restore into the real cluster only with a written change window. Stop the
   API, then `pg_restore` into a new database or replace the current one using
   the same flags the dump was taken with (`--no-owner --no-acl`, custom
   format). Keep the previous volume until the app has served traffic from
   the restored data.

## 6. Restore media config

```bash
rclone copyto r2:sarh-backups/media-config/sarh-media-STAMP.tar.gz.age /tmp/media.tar.gz.age
age -d -i /root/sarh-backup-age.key -o /tmp/media.tar.gz /tmp/media.tar.gz.age
sudo tar -C /opt/sarh-media -xzf /tmp/media.tar.gz
```

Confirm `livekit.yaml`, the Caddy certificate paths, and `.env.media` before
restarting the media compose stack. Certificates in the archive are secret;
the archive is encrypted only while it is in the bucket.

## 7. What this does not do

- It does not rotate the age identity or the rclone crypt password.
- It does not back up Redis, the Docker images, or object-storage media.
- A green dry-run on a workstation is not a production backup.
