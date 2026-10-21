#!/usr/bin/env bash
# Failure alerts for backup jobs.
# Email is the channel: ALERT_EMAIL_TO (default sarh@getsarh.com) via SMTP_*.
# Telegram is optional and off unless BACKUP_ALERT_TELEGRAM=1.
# Sourced, not executed. Does not print secrets.
set -euo pipefail

alert_env() {
  local key="$1" def="${2:-}" val=""
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi
  local file="${ALERT_ENV_FILE:-${ENV_FILE:-}}"
  if [[ -n "$file" && -f "$file" ]]; then
    val="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/[[:space:]]+$//")" || true
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
  fi
  printf '%s' "${val:-$def}"
}

# send_backup_alert SUBJECT BODY
# Returns 0 when at least one channel accepted the message.
send_backup_alert() {
  local subject="$1"
  local body="$2"
  local to host port user pass from
  to="$(alert_env ALERT_EMAIL_TO sarh@getsarh.com)"
  host="$(alert_env SMTP_HOST)"
  port="$(alert_env SMTP_PORT 587)"
  user="$(alert_env SMTP_USER)"
  pass="$(alert_env SMTP_PASS)"
  from="$(alert_env SMTP_FROM)"
  if [[ -z "$from" ]]; then
    from="$(alert_env EMAIL_FROM sarh@getsarh.com)"
  fi

  local emailed=0
  if [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
    echo "DRY-RUN alert email to=${to} subject=${subject}"
    echo "$body"
    emailed=1
  elif [[ -z "$host" || -z "$user" || -z "$pass" ]]; then
    echo "ERROR: backup alert email not sent — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (to=${to})" >&2
  else
    SUBJECT="$subject" ALERT_BODY="$body" ALERT_EMAIL_TO="$to" \
      SMTP_HOST="$host" SMTP_PORT="$port" SMTP_USER="$user" SMTP_PASS="$pass" SMTP_FROM="$from" \
      python3 - <<'PY'
import os, smtplib, ssl
from email.message import EmailMessage

msg = EmailMessage()
msg["Subject"] = os.environ["SUBJECT"]
msg["From"] = os.environ["SMTP_FROM"]
msg["To"] = os.environ["ALERT_EMAIL_TO"]
msg.set_content(os.environ["ALERT_BODY"])
host = os.environ["SMTP_HOST"]
port = int(os.environ.get("SMTP_PORT") or "587")
user = os.environ["SMTP_USER"]
password = os.environ["SMTP_PASS"]
timeout = 30
if port == 465:
    with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
        smtp.login(user, password)
        smtp.send_message(msg)
else:
    with smtplib.SMTP(host, port, timeout=timeout) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(user, password)
        smtp.send_message(msg)
print(f"alert email sent to {os.environ['ALERT_EMAIL_TO']}")
PY
    emailed=1
  fi

  # Optional. Off unless explicitly enabled. Not a substitute for email.
  if [[ "$(alert_env BACKUP_ALERT_TELEGRAM 0)" == 1 ]]; then
    local token chat
    token="$(alert_env TELEGRAM_ALERT_BOT_TOKEN)"
    chat="$(alert_env TELEGRAM_ALERT_CHAT_ID)"
    if [[ -n "$token" && -n "$chat" && "${BACKUP_DRY_RUN:-}" != 1 ]]; then
      curl -fsS --max-time 20 \
        -d "chat_id=${chat}" \
        --data-urlencode "text=${subject}"$'\n'"${body}" \
        "https://api.telegram.org/bot${token}/sendMessage" >/dev/null \
        && echo "alert telegram sent"
    elif [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
      echo "DRY-RUN telegram (BACKUP_ALERT_TELEGRAM=1)"
    fi
  fi

  [[ "$emailed" == 1 ]]
}
