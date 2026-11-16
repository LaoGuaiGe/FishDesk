#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

readonly TEST_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly UPDATER=$(cd -- "$TEST_DIR/.." && pwd)/fishdesk-updater.sh
readonly ORIGINAL_PATH=$PATH
readonly REAL_TAR=$(command -v tar)
export REAL_TAR
TEST_TMP=$(mktemp -d)
trap 'rm -rf -- "$TEST_TMP"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  if [[ -n ${ROOT:-} && -f "$ROOT/output.log" ]]; then
    printf '%s\n' '--- updater output ---' >&2
    command cat "$ROOT/output.log" >&2
  fi
  exit 1
}

assert_file_contains() {
  grep -Fq -- "$2" "$1" || fail "$1 does not contain: $2"
}

assert_file_not_contains() {
  if grep -Fq -- "$2" "$1"; then
    fail "$1 unexpectedly contains: $2"
  fi
}

assert_equals() {
  [[ "$1" == "$2" ]] || fail "expected '$2', got '$1'"
}

digest() {
  printf 'sha256:%064d' "$1"
}

write_manifest() {
  local version=$1 image_digest=$2 min_version=${3:-1}
  printf '{"version":"%s","image":"ghcr.io/laoguaige/fishdesk","digest":"%s","minUpdaterVersion":%s,"createdAt":"2026-11-16T00:00:00Z"}\n' \
    "$version" "$image_digest" "$min_version" > "$MOCK_MANIFEST"
}

current_image() {
  local line image=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      FISHDESK_IMAGE=*) image=${line#FISHDESK_IMAGE=} ;;
    esac
  done < "$ROOT/.env"
  printf '%s' "$image"
}

write_mock_commands() {
  mkdir -p "$MOCK_BIN"
  command cat > "$MOCK_BIN/docker" <<'MOCK'
#!/usr/bin/env bash
set -u
printf 'docker %s\n' "$*" >> "$MOCK_LOG"
current_image() {
  local line image=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      FISHDESK_IMAGE=*) image=${line#FISHDESK_IMAGE=} ;;
    esac
  done < "$FISHDESK_ROOT/.env"
  printf '%s' "$image"
}
if [[ ${1:-} == compose && ${2:-} == version ]]; then
  exit 0
fi
case ${1:-} in
  pull)
    [[ ${MOCK_PULL_FAIL:-0} != 1 ]] || exit 1
    exit 0
    ;;
  inspect)
    printf '%s\n' "$MOCK_DATA_DIR"
    exit 0
    ;;
  exec)
    [[ ${MOCK_DATA_READABLE:-1} == 1 && -r "$MOCK_DATA_DIR" ]]
    exit $?
    ;;
  compose)
    action=""
    for argument in "$@"; do
      case "$argument" in
        stop|up) action=$argument ;;
      esac
    done
    if [[ "$action" == up && ${MOCK_MUTATE_IMAGE:-} != "" && $(current_image) == "$MOCK_MUTATE_IMAGE" ]]; then
      printf 'changed by new version\n' > "$MOCK_DATA_DIR/visible.txt"
      printf 'must be removed by rollback\n' > "$MOCK_DATA_DIR/new-only.txt"
    fi
    if [[ "$action" == up && ${MOCK_CRASH_ON_IMAGE:-} != "" && $(current_image) == "$MOCK_CRASH_ON_IMAGE" ]]; then
      kill -KILL "$PPID"
      sleep 1
      exit 137
    fi
    exit 0
    ;;
esac
exit 0
MOCK

  command cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
set -u
printf 'curl %s\n' "$*" >> "$MOCK_LOG"
output=""
url=""
while (( $# > 0 )); do
  case "$1" in
    --output)
      output=$2
      shift 2
      ;;
    http://*|https://*)
      url=$1
      shift
      ;;
    *) shift ;;
  esac
done
case "$url" in
  https://github.com/LaoGuaiGe/FishDesk/releases/latest/download/release.json)
    command cat "$MOCK_MANIFEST" > "$output"
    ;;
  http://127.0.0.1:18080/healthz)
    line=""
    image=""
    while IFS= read -r line || [[ -n "$line" ]]; do
      case "$line" in
        FISHDESK_IMAGE=*) image=${line#FISHDESK_IMAGE=} ;;
      esac
    done < "$FISHDESK_ROOT/.env"
    if [[ ${MOCK_UNHEALTHY_IMAGE:-} != "" && "$image" == "$MOCK_UNHEALTHY_IMAGE" ]]; then
      exit 1
    fi
    [[ ${MOCK_HEALTHY:-1} == 1 ]]
    exit $?
    ;;
  *) exit 1 ;;
esac
MOCK

  command cat > "$MOCK_BIN/df" <<'MOCK'
#!/usr/bin/env bash
printf 'df %s\n' "$*" >> "$MOCK_LOG"
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
if [[ ${MOCK_DISK_FULL:-0} == 1 ]]; then
  printf '/dev/mock 1000000 999999 1 100%% /data\n'
else
  printf '/dev/mock 1000000000 1000 999999000 1%% /data\n'
fi
MOCK

  command cat > "$MOCK_BIN/tar" <<'MOCK'
#!/usr/bin/env bash
if [[ ${1:-} == -tzf && ${MOCK_BACKUP_INVALID:-0} == 1 ]]; then
  exit 1
fi
exec "$REAL_TAR" "$@"
MOCK

  command cat > "$MOCK_BIN/flock" <<'MOCK'
#!/usr/bin/env bash
printf 'flock %s\n' "$*" >> "$MOCK_LOG"
exit 0
MOCK
  chmod +x "$MOCK_BIN/docker" "$MOCK_BIN/curl" "$MOCK_BIN/df" "$MOCK_BIN/tar" "$MOCK_BIN/flock"
}

setup_case() {
  local name=$1
  ROOT="$TEST_TMP/$name"
  MOCK_BIN="$ROOT/mock-bin"
  MOCK_LOG="$ROOT/commands.log"
  MOCK_DATA_DIR="$ROOT/data-volume"
  MOCK_MANIFEST="$ROOT/release.json"
  MOCK_PULL_FAIL=0
  MOCK_HEALTHY=1
  MOCK_DATA_READABLE=1
  MOCK_UNHEALTHY_IMAGE=""
  MOCK_MUTATE_IMAGE=""
  MOCK_CRASH_ON_IMAGE=""
  MOCK_DISK_FULL=0
  MOCK_BACKUP_INVALID=0
  export ROOT MOCK_LOG MOCK_DATA_DIR MOCK_MANIFEST MOCK_PULL_FAIL MOCK_HEALTHY
  export MOCK_DATA_READABLE MOCK_UNHEALTHY_IMAGE MOCK_MUTATE_IMAGE MOCK_CRASH_ON_IMAGE
  export MOCK_DISK_FULL MOCK_BACKUP_INVALID
  mkdir -p "$ROOT/update/requests" "$ROOT/update/status" "$ROOT/backups" "$MOCK_DATA_DIR/nested"
  printf 'original data\n' > "$MOCK_DATA_DIR/visible.txt"
  printf 'hidden data\n' > "$MOCK_DATA_DIR/.hidden"
  printf 'nested data\n' > "$MOCK_DATA_DIR/nested/item.txt"
  OLD_IMAGE="ghcr.io/laoguaige/fishdesk@$(digest 1)"
  NEW_IMAGE="ghcr.io/laoguaige/fishdesk@$(digest 2)"
  printf 'FISHDESK_PASSWORD=keep-me\nFISHDESK_SESSION_DAYS=45\nFISHDESK_IMAGE=%s\nAI_MODEL=keep-model\n' "$OLD_IMAGE" > "$ROOT/.env"
  printf 'services: {}\n' > "$ROOT/docker-compose.yml"
  printf '1.0.0\n' > "$ROOT/update/current-version"
  : > "$MOCK_LOG"
  write_mock_commands
  write_manifest 1.1.0 "$(digest 2)"
}

request_update() {
  # Deliberately hostile-looking fields must be ignored by the updater.
  printf '{"image":"https://evil.invalid/x","command":"touch /tmp/should-not-exist"}\n' > "$ROOT/update/requests/upgrade.json"
}

run_updater() {
  local status
  set +e
  PATH="$MOCK_BIN:$ORIGINAL_PATH" FISHDESK_ROOT="$ROOT" FISHDESK_HEALTH_TIMEOUT=2 \
    bash "$UPDATER" --once > "$ROOT/output.log" 2>&1
  status=$?
  set -e
  RUN_STATUS=$status
}

backup_count() {
  local -a files=("$ROOT/backups"/data-*.tar.gz)
  if [[ ! -e ${files[0]} ]]; then
    printf '0'
  else
    printf '%s' "${#files[@]}"
  fi
}

pull_count() {
  grep -Fc 'docker pull ' "$MOCK_LOG" || true
}

test_successful_upgrade() {
  setup_case success
  request_update
  run_updater
  assert_equals "$RUN_STATUS" 0
  assert_equals "$(current_image)" "$NEW_IMAGE"
  assert_file_contains "$ROOT/.env" 'FISHDESK_PASSWORD=keep-me'
  assert_file_contains "$ROOT/.env" 'FISHDESK_SESSION_DAYS=45'
  assert_file_contains "$ROOT/.env" 'AI_MODEL=keep-model'
  assert_file_contains "$ROOT/update/status/status.json" '"phase":"succeeded"'
  assert_file_contains "$ROOT/update/status/status.json" '"currentVersion":"1.1.0"'
  assert_equals "$(<"$ROOT/update/current-version")" '1.1.0'
  assert_equals "$(backup_count)" 1
  local backup
  backup=$(printf '%s\n' "$ROOT/backups"/data-*.tar.gz)
  tar -tzf "$backup" | grep -Fq './.hidden' || fail 'backup omitted hidden files'
  tar -tzf "$backup" | grep -Fq './nested/item.txt' || fail 'backup omitted nested files'
  assert_equals "$(tar -xOzf "$backup" ./visible.txt)" 'original data'
  assert_file_contains "$MOCK_LOG" "docker pull $NEW_IMAGE"
  assert_file_contains "$MOCK_LOG" 'http://127.0.0.1:18080/healthz'
  assert_file_contains "$MOCK_LOG" 'docker exec fishdesk test -r /data'
  [[ ! -e "$ROOT/update/requests/upgrade.json" ]] || fail 'request was not consumed'
  [[ ! -e /tmp/should-not-exist ]] || fail 'request command was executed'
}

test_repeated_request() {
  setup_case repeated
  request_update
  run_updater
  assert_equals "$RUN_STATUS" 0
  run_updater
  assert_equals "$RUN_STATUS" 0
  assert_equals "$(pull_count)" 1
  request_update
  run_updater
  assert_equals "$RUN_STATUS" 0
  assert_equals "$(pull_count)" 1
  assert_file_contains "$ROOT/update/status/status.json" '当前已经是最新版本'
}

test_pull_failure() {
  setup_case pull-failure
  MOCK_PULL_FAIL=1
  export MOCK_PULL_FAIL
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'pull failure unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_file_contains "$ROOT/update/status/status.json" '"error":"docker_pull_failed"'
  assert_file_not_contains "$MOCK_LOG" ' stop '
  assert_equals "$(<"$MOCK_DATA_DIR/visible.txt")" 'original data'
  assert_equals "$(backup_count)" 0
}

test_health_failure_rolls_back() {
  setup_case health-rollback
  MOCK_UNHEALTHY_IMAGE=$NEW_IMAGE
  MOCK_MUTATE_IMAGE=$NEW_IMAGE
  export MOCK_UNHEALTHY_IMAGE MOCK_MUTATE_IMAGE
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'unhealthy upgrade unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_equals "$(<"$MOCK_DATA_DIR/visible.txt")" 'original data'
  assert_equals "$(<"$MOCK_DATA_DIR/.hidden")" 'hidden data'
  [[ ! -e "$MOCK_DATA_DIR/new-only.txt" ]] || fail 'rollback did not remove new data files'
  assert_file_contains "$ROOT/update/status/status.json" '"phase":"failed"'
  assert_file_contains "$ROOT/update/status/status.json" '"error":"health_check_failed"'
  assert_file_contains "$ROOT/update/status/status.json" '已自动恢复旧版本和全部数据'
  assert_equals "$(<"$ROOT/update/current-version")" '1.0.0'
  assert_equals "$(backup_count)" 1
}

test_double_failure_stays_in_maintenance() {
  setup_case double-failure
  MOCK_HEALTHY=0
  export MOCK_HEALTHY
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'double failure unexpectedly succeeded'
  assert_file_contains "$ROOT/update/status/status.json" '"state":"failed","phase":"maintenance"'
  assert_file_contains "$ROOT/update/status/status.json" '"error":"rollback_failed"'
  assert_file_contains "$ROOT/update/status/status.json" "$ROOT/backups/data-"
}

test_backup_retention() {
  setup_case retention
  local i
  for i in 1 2 3 4 5; do
    printf 'old\n' > "$ROOT/backups/data-2020010${i}T000000Z-0.9.${i}-old.tar.gz"
  done
  request_update
  run_updater
  assert_equals "$RUN_STATUS" 0
  assert_equals "$(backup_count)" 5
  [[ ! -e "$ROOT/backups/data-20200101T000000Z-0.9.1-old.tar.gz" ]] || fail 'oldest backup was not removed'
  local -a files=("$ROOT/backups"/data-*.tar.gz)
  tar -tzf "${files[${#files[@]}-1]}" >/dev/null || fail 'new backup is not readable'
}

test_insufficient_disk_space() {
  setup_case disk-full
  MOCK_DISK_FULL=1
  export MOCK_DISK_FULL
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'disk-full upgrade unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_file_contains "$ROOT/update/status/status.json" '"error":"insufficient_disk_space"'
  assert_file_contains "$ROOT/update/status/status.json" '磁盘可用空间不足'
  assert_file_not_contains "$MOCK_LOG" ' stop '
  assert_equals "$(backup_count)" 0
  [[ ! -e "$ROOT/update/transaction" ]] || fail 'disk-full upgrade left a transaction'
}

test_backup_verification_failure() {
  setup_case backup-invalid
  MOCK_BACKUP_INVALID=1
  export MOCK_BACKUP_INVALID
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'invalid backup unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_file_contains "$ROOT/update/status/status.json" '"error":"backup_failed"'
  assert_equals "$(backup_count)" 0
  assert_equals "$(<"$MOCK_DATA_DIR/visible.txt")" 'original data'
  [[ ! -e "$ROOT/update/transaction" ]] || fail 'backup failure left a transaction'
  [[ ! -e "$ROOT/update/requests/.upgrade.json.processing" ]] || fail 'backup failure left a processing request'
}

test_interrupted_after_image_switch_recovers_old_version() {
  setup_case interrupted-switch
  MOCK_CRASH_ON_IMAGE=$NEW_IMAGE
  MOCK_MUTATE_IMAGE=$NEW_IMAGE
  export MOCK_CRASH_ON_IMAGE MOCK_MUTATE_IMAGE
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'interrupted upgrade unexpectedly succeeded'
  assert_equals "$(current_image)" "$NEW_IMAGE"
  assert_file_contains "$ROOT/update/transaction" 'stage=switching'
  assert_file_contains "$ROOT/update/transaction" "oldImage=$OLD_IMAGE"
  assert_equals "$(<"$MOCK_DATA_DIR/visible.txt")" 'changed by new version'

  MOCK_CRASH_ON_IMAGE=""
  MOCK_MUTATE_IMAGE=""
  export MOCK_CRASH_ON_IMAGE MOCK_MUTATE_IMAGE
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'interrupted upgrade rollback unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_equals "$(<"$ROOT/update/current-version")" '1.0.0'
  assert_equals "$(<"$MOCK_DATA_DIR/visible.txt")" 'original data'
  assert_equals "$(<"$MOCK_DATA_DIR/.hidden")" 'hidden data'
  [[ ! -e "$MOCK_DATA_DIR/new-only.txt" ]] || fail 'interrupted rollback did not remove new data files'
  assert_file_contains "$ROOT/update/status/status.json" '"error":"update_interrupted"'
  assert_file_contains "$ROOT/update/status/status.json" '已自动恢复旧版本和全部数据'
  [[ ! -e "$ROOT/update/transaction" ]] || fail 'successful recovery left a transaction'
  [[ ! -e "$ROOT/update/requests/.upgrade.json.processing" ]] || fail 'successful recovery left a processing request'
}

test_incompatible_updater() {
  setup_case incompatible
  write_manifest 2.0.0 "$(digest 3)" 2
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'incompatible manifest unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_file_contains "$ROOT/update/status/status.json" '"error":"updater_update_required"'
  assert_equals "$(pull_count)" 0
}

test_invalid_manifest() {
  setup_case invalid-manifest
  printf '{"version":"1.1.0","image":"evil","digest":"x","minUpdaterVersion":1,"createdAt":"now"}\n' > "$MOCK_MANIFEST"
  request_update
  run_updater
  [[ "$RUN_STATUS" != 0 ]] || fail 'invalid manifest unexpectedly succeeded'
  assert_equals "$(current_image)" "$OLD_IMAGE"
  assert_file_contains "$ROOT/update/status/status.json" '"error":"invalid_manifest"'
  assert_equals "$(pull_count)" 0
}

tests=(
  test_successful_upgrade
  test_repeated_request
  test_pull_failure
  test_health_failure_rolls_back
  test_double_failure_stays_in_maintenance
  test_backup_retention
  test_insufficient_disk_space
  test_backup_verification_failure
  test_interrupted_after_image_switch_recovers_old_version
  test_incompatible_updater
  test_invalid_manifest
)

for test_name in "${tests[@]}"; do
  "$test_name"
  printf 'ok - %s\n' "$test_name"
done
printf 'All %d updater tests passed.\n' "${#tests[@]}"
