#!/usr/bin/env bash
# FishDesk host updater. Request-file contents are deliberately never evaluated.
set -u
set -o pipefail
export LC_ALL=C
umask 077

readonly UPDATER_VERSION=1
readonly MANIFEST_URL="https://github.com/LaoGuaiGe/FishDesk/releases/latest/download/release.json"
readonly IMAGE_NAME="ghcr.io/laoguaige/fishdesk"
readonly ROOT="${FISHDESK_ROOT:-/opt/fishdesk}"
readonly UPDATE_DIR="$ROOT/update"
readonly REQUEST_FILE="$UPDATE_DIR/requests/upgrade.json"
readonly PROCESSING_FILE="$UPDATE_DIR/requests/.upgrade.json.processing"
readonly STATUS_DIR="$UPDATE_DIR/status"
readonly STATUS_FILE="$STATUS_DIR/status.json"
readonly VERSION_FILE="$UPDATE_DIR/current-version"
readonly TRANSACTION_FILE="$UPDATE_DIR/transaction"
readonly BACKUP_DIR="$ROOT/backups"
readonly ENV_FILE="$ROOT/.env"
readonly COMPOSE_FILE="$ROOT/docker-compose.yml"
readonly HEALTH_URL="http://127.0.0.1:18080/healthz"

HEALTH_TIMEOUT="${FISHDESK_HEALTH_TIMEOUT:-120}"
case "$HEALTH_TIMEOUT" in
  ''|*[!0-9]*) HEALTH_TIMEOUT=120 ;;
esac
if (( HEALTH_TIMEOUT < 1 || HEALTH_TIMEOUT > 120 )); then
  HEALTH_TIMEOUT=120
fi

CURRENT_VERSION="0.0.0"
LATEST_VERSION="0.0.0"
BACKUP_PATH=""
DATA_SOURCE=""
OLD_IMAGE=""
NEW_IMAGE=""
OLD_VERSION=""
TRANSACTION_STAGE=""
MANIFEST_VERSION=""
MANIFEST_DIGEST=""
MANIFEST_MIN_VERSION=""
COMPOSE=()

json_escape() {
  local value=${1//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\r'/\\r}
  value=${value//$'\n'/\\n}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

write_status() {
  local state=$1
  local phase=$2
  local message=$3
  local error=${4:-}
  local updated_at tmp
  updated_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ') || return 1
  tmp=$(mktemp "$STATUS_DIR/.status.json.XXXXXX") || return 1
  if ! printf '{"state":"%s","phase":"%s","message":"%s","currentVersion":"%s","latestVersion":"%s","backup":"%s","error":"%s","updatedAt":"%s"}\n' \
    "$(json_escape "$state")" \
    "$(json_escape "$phase")" \
    "$(json_escape "$message")" \
    "$(json_escape "$CURRENT_VERSION")" \
    "$(json_escape "$LATEST_VERSION")" \
    "$(json_escape "$BACKUP_PATH")" \
    "$(json_escape "$error")" \
    "$updated_at" > "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  chmod 0644 "$tmp"
  mv -f -- "$tmp" "$STATUS_FILE"
}

save_current_version() {
  local tmp
  tmp=$(mktemp "$UPDATE_DIR/.current-version.XXXXXX") || return 1
  if ! printf '%s\n' "$1" > "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  mv -f -- "$tmp" "$VERSION_FILE"
}

read_current_version() {
  local version
  if [[ -f "$VERSION_FILE" ]]; then
    IFS= read -r version < "$VERSION_FILE" || true
    if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s' "$version"
      return 0
    fi
  fi
  printf '0.0.0'
}

version_gt() {
  local left=$1 right=$2
  local -a a b
  local i x y
  [[ "$left" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$right" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS='.' read -r -a a <<< "$left"
  IFS='.' read -r -a b <<< "$right"
  for i in 0 1 2; do
    x=${a[i]#"${a[i]%%[!0]*}"}
    y=${b[i]#"${b[i]%%[!0]*}"}
    x=${x:-0}
    y=${y:-0}
    if (( ${#x} > ${#y} )); then
      return 0
    elif (( ${#x} < ${#y} )); then
      return 1
    elif [[ "$x" > "$y" ]]; then
      return 0
    elif [[ "$x" < "$y" ]]; then
      return 1
    fi
  done
  return 1
}

read_env_image() {
  local line image=""
  [[ -f "$ENV_FILE" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      FISHDESK_IMAGE=*) image=${line#FISHDESK_IMAGE=} ;;
    esac
  done < "$ENV_FILE"
  [[ "$image" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  printf '%s' "$image"
}

set_env_image() {
  local image=$1 line found=0 tmp
  [[ "$image" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  [[ -f "$ENV_FILE" ]] || return 1
  tmp=$(mktemp "$ROOT/.env.XXXXXX") || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      FISHDESK_IMAGE=*)
        if (( found == 0 )); then
          printf 'FISHDESK_IMAGE=%s\n' "$image" >> "$tmp" || { rm -f -- "$tmp"; return 1; }
          found=1
        fi
        ;;
      *) printf '%s\n' "$line" >> "$tmp" || { rm -f -- "$tmp"; return 1; } ;;
    esac
  done < "$ENV_FILE"
  if (( found == 0 )); then
    printf 'FISHDESK_IMAGE=%s\n' "$image" >> "$tmp" || { rm -f -- "$tmp"; return 1; }
  fi
  chmod 0600 "$tmp"
  mv -f -- "$tmp" "$ENV_FILE"
}

compose() {
  "${COMPOSE[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    return 1
  fi
}

download_manifest() {
  local tmp json size pattern
  tmp=$(mktemp "$UPDATE_DIR/.release.json.XXXXXX") || return 1
  if ! curl --fail --silent --show-error --location \
      --connect-timeout 10 --max-time 30 \
      --proto '=https' --proto-redir '=https' \
      --output "$tmp" "$MANIFEST_URL"; then
    rm -f -- "$tmp"
    return 1
  fi
  size=$(wc -c < "$tmp") || { rm -f -- "$tmp"; return 1; }
  if (( size > 4096 )); then
    rm -f -- "$tmp"
    return 1
  fi
  json=$(<"$tmp")
  rm -f -- "$tmp"
  pattern='^\{"version":"([0-9]+\.[0-9]+\.[0-9]+)","image":"(ghcr\.io/laoguaige/fishdesk)","digest":"(sha256:[0-9a-f]{64})","minUpdaterVersion":([0-9]+),"createdAt":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)"\}$'
  [[ "$json" =~ $pattern ]] || return 1
  MANIFEST_VERSION=${BASH_REMATCH[1]}
  [[ ${BASH_REMATCH[2]} == "$IMAGE_NAME" ]] || return 1
  MANIFEST_DIGEST=${BASH_REMATCH[3]}
  MANIFEST_MIN_VERSION=${BASH_REMATCH[4]}
}

manifest_supported() {
  # Only updater contract version 0 or 1 is compatible; no integer arithmetic on input.
  [[ "$MANIFEST_MIN_VERSION" =~ ^0+$|^0*1$ ]]
}

get_data_source() {
  local source
  source=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' fishdesk) || return 1
  [[ -n "$source" && "$source" != "/" && -d "$source" ]] || return 1
  case "$source" in
    /*) DATA_SOURCE=$source ;;
    *) return 1 ;;
  esac
}

create_backup() {
  local timestamp tmp target
  get_data_source || return 1
  timestamp=$(date -u +'%Y%m%dT%H%M%SZ') || return 1
  target="$BACKUP_DIR/data-${timestamp}-${CURRENT_VERSION}-$$.tar.gz"
  tmp=$(mktemp "$BACKUP_DIR/.data-backup.XXXXXX") || return 1
  if ! tar -czf "$tmp" -C "$DATA_SOURCE" .; then
    rm -f -- "$tmp"
    return 1
  fi
  if ! tar -tzf "$tmp" >/dev/null 2>&1; then
    rm -f -- "$tmp"
    return 1
  fi
  chmod 0600 "$tmp"
  if ! mv -f -- "$tmp" "$target"; then
    rm -f -- "$tmp"
    return 1
  fi
  BACKUP_PATH=$target
}

check_disk_space() {
  local data_usage data_kb df_output last_line available_kb required_kb
  get_data_source || return 1
  data_usage=$(du -sk "$DATA_SOURCE") || return 1
  data_kb=${data_usage%%[[:space:]]*}
  [[ "$data_kb" =~ ^[0-9]+$ ]] || return 1
  df_output=$(df -Pk "$BACKUP_DIR") || return 1
  last_line=${df_output##*$'\n'}
  read -r _ _ _ available_kb _ <<< "$last_line"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || return 1
  required_kb=$((data_kb + 262144))
  (( available_kb >= required_kb ))
}

restore_backup() {
  [[ -n "$BACKUP_PATH" && -f "$BACKUP_PATH" ]] || return 0
  [[ -n "$DATA_SOURCE" && "$DATA_SOURCE" != "/" && -d "$DATA_SOURCE" ]] || return 1
  shopt -s dotglob nullglob
  rm -rf -- "$DATA_SOURCE"/*
  shopt -u dotglob nullglob
  tar -xzf "$BACKUP_PATH" -C "$DATA_SOURCE"
}

retain_backups() {
  local -a files=("$BACKUP_DIR"/data-*.tar.gz)
  local count i remove_count
  [[ -e ${files[0]} ]] || return 0
  count=${#files[@]}
  (( count > 5 )) || return 0
  remove_count=$((count - 5))
  for ((i = 0; i < remove_count; i++)); do
    rm -f -- "${files[i]}"
  done
}

verify_health() {
  local started=$SECONDS elapsed remaining timeout sleep_time
  while :; do
    elapsed=$((SECONDS - started))
    remaining=$((HEALTH_TIMEOUT - elapsed))
    (( remaining > 0 )) || return 1
    timeout=$remaining
    (( timeout > 2 )) && timeout=2
    if curl --fail --silent --show-error --max-time "$timeout" --output /dev/null "$HEALTH_URL" && \
       docker exec fishdesk test -r /data; then
      return 0
    fi
    elapsed=$((SECONDS - started))
    remaining=$((HEALTH_TIMEOUT - elapsed))
    (( remaining > 0 )) || return 1
    sleep_time=$remaining
    (( sleep_time > 2 )) && sleep_time=2
    sleep "$sleep_time"
  done
}

write_transaction() {
  local stage=$1 tmp
  [[ "$OLD_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$MANIFEST_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$OLD_IMAGE" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$NEW_IMAGE" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  tmp=$(mktemp "$UPDATE_DIR/.transaction.XXXXXX") || return 1
  if ! printf 'version=1\nstage=%s\noldVersion=%s\ntargetVersion=%s\noldImage=%s\nnewImage=%s\nbackup=%s\ndataSource=%s\n' \
    "$stage" "$OLD_VERSION" "$MANIFEST_VERSION" "$OLD_IMAGE" "$NEW_IMAGE" "$BACKUP_PATH" "$DATA_SOURCE" > "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  chmod 0600 "$tmp"
  if ! mv -f -- "$tmp" "$TRANSACTION_FILE"; then
    rm -f -- "$tmp"
    return 1
  fi
  TRANSACTION_STAGE=$stage
}

read_transaction() {
  local line version_seen=0 stage_seen=0 old_version_seen=0 target_version_seen=0
  local old_image_seen=0 new_image_seen=0 backup_seen=0 data_source_seen=0
  OLD_VERSION=""
  MANIFEST_VERSION=""
  OLD_IMAGE=""
  NEW_IMAGE=""
  BACKUP_PATH=""
  DATA_SOURCE=""
  TRANSACTION_STAGE=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      version=1) ((version_seen += 1)) ;;
      stage=*) TRANSACTION_STAGE=${line#stage=}; ((stage_seen += 1)) ;;
      oldVersion=*) OLD_VERSION=${line#oldVersion=}; ((old_version_seen += 1)) ;;
      targetVersion=*) MANIFEST_VERSION=${line#targetVersion=}; ((target_version_seen += 1)) ;;
      oldImage=*) OLD_IMAGE=${line#oldImage=}; ((old_image_seen += 1)) ;;
      newImage=*) NEW_IMAGE=${line#newImage=}; ((new_image_seen += 1)) ;;
      backup=*) BACKUP_PATH=${line#backup=}; ((backup_seen += 1)) ;;
      dataSource=*) DATA_SOURCE=${line#dataSource=}; ((data_source_seen += 1)) ;;
      *) return 1 ;;
    esac
  done < "$TRANSACTION_FILE"
  [[ $version_seen == 1 && $stage_seen == 1 && $old_version_seen == 1 && $target_version_seen == 1 ]] || return 1
  [[ $old_image_seen == 1 && $new_image_seen == 1 && $backup_seen == 1 && $data_source_seen == 1 ]] || return 1
  [[ "$TRANSACTION_STAGE" =~ ^prepared$|^backup_ready$|^switching$|^verifying$|^committed$ ]] || return 1
  [[ "$OLD_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$MANIFEST_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  [[ "$OLD_IMAGE" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "$NEW_IMAGE" =~ ^ghcr\.io/laoguaige/fishdesk@sha256:[0-9a-f]{64}$ ]] || return 1
  if [[ -n "$BACKUP_PATH" || -n "$DATA_SOURCE" ]]; then
    [[ "$BACKUP_PATH" == "$BACKUP_DIR"/data-*.tar.gz && -f "$BACKUP_PATH" ]] || return 1
    [[ "$DATA_SOURCE" == /* && "$DATA_SOURCE" != "/" && -d "$DATA_SOURCE" ]] || return 1
  fi
}

clear_transaction() {
  rm -f -- "$TRANSACTION_FILE"
}

rollback_update() {
  local upgrade_error=$1 rollback_failed=0
  write_status rolling_back rolling_back "升级未完成，正在恢复旧版本和升级前备份" "$upgrade_error" || true
  compose stop -t 30 fishdesk >/dev/null 2>&1 || true
  set_env_image "$OLD_IMAGE" || rollback_failed=1
  restore_backup || rollback_failed=1
  save_current_version "$OLD_VERSION" || rollback_failed=1
  compose up -d --no-deps fishdesk >/dev/null 2>&1 || rollback_failed=1
  CURRENT_VERSION=$OLD_VERSION
  if (( rollback_failed == 0 )) && verify_health; then
    write_status failed failed "升级失败，已自动恢复旧版本和全部数据，可以继续使用" "$upgrade_error" || true
    rm -f -- "$PROCESSING_FILE"
    clear_transaction || true
  else
    compose stop -t 30 fishdesk >/dev/null 2>&1 || true
    write_status failed maintenance "升级和自动恢复均未完成，服务已停止。请勿删除备份：${BACKUP_PATH:-无}" rollback_failed || true
  fi
  return 1
}

recover_interrupted_update() {
  if ! read_transaction; then
    compose stop -t 30 fishdesk >/dev/null 2>&1 || true
    write_status failed maintenance "升级事务记录已损坏，服务已停止。请保留备份并按部署说明检查服务器" invalid_transaction || true
    return 1
  fi
  CURRENT_VERSION=$OLD_VERSION
  LATEST_VERSION=$MANIFEST_VERSION
  if [[ "$TRANSACTION_STAGE" == committed && $(read_current_version) == "$MANIFEST_VERSION" && $(read_env_image) == "$NEW_IMAGE" ]]; then
    if verify_health; then
      CURRENT_VERSION=$MANIFEST_VERSION
      retain_backups || true
      write_status succeeded succeeded "中断的升级已确认完成，FishDesk 运行正常" || return 1
      rm -f -- "$PROCESSING_FILE" || return 1
      clear_transaction || return 1
      return 0
    fi
  fi
  rollback_update update_interrupted
}

run_update() {
  BACKUP_PATH=""
  DATA_SOURCE=""
  OLD_IMAGE=""
  NEW_IMAGE=""
  CURRENT_VERSION=$(read_current_version)
  OLD_VERSION=$CURRENT_VERSION
  LATEST_VERSION=$CURRENT_VERSION

  write_status checking checking "正在检查官方发布信息" || return 1
  if ! download_manifest; then
    write_status failed failed "无法下载或校验官方发布信息，当前版本和数据均未改动" invalid_manifest || true
    return 1
  fi
  LATEST_VERSION=$MANIFEST_VERSION
  if ! manifest_supported; then
    write_status failed failed "本次更新需要先升级服务器更新器，当前版本和数据均未改动" updater_update_required || true
    return 1
  fi
  if ! version_gt "$MANIFEST_VERSION" "$CURRENT_VERSION"; then
    write_status succeeded succeeded "当前已经是最新版本，无需升级" || true
    return 0
  fi

  NEW_IMAGE="$IMAGE_NAME@$MANIFEST_DIGEST"
  write_status downloading downloading "正在下载官方发布的固定版本镜像" || return 1
  if ! docker pull "$NEW_IMAGE"; then
    write_status failed failed "新版本镜像下载失败，当前版本和数据均未改动" docker_pull_failed || true
    return 1
  fi
  if ! OLD_IMAGE=$(read_env_image); then
    write_status failed failed "无法确认当前镜像版本，升级已取消，数据未改动" invalid_current_image || true
    return 1
  fi
  if ! check_disk_space; then
    write_status failed failed "磁盘可用空间不足，备份至少需要额外 256 MB；当前版本和数据均未改动" insufficient_disk_space || true
    return 1
  fi
  if ! write_transaction prepared; then
    write_status failed failed "无法记录升级事务，升级已取消，数据未改动" transaction_write_failed || true
    return 1
  fi

  write_status maintenance maintenance "正在停止 FishDesk，升级期间修改会暂存在浏览器本机" || {
    rollback_update status_write_failed
    return 1
  }
  if ! compose stop -t 30 fishdesk; then
    rollback_update compose_stop_failed
    return 1
  fi

  if ! write_status backing_up backing_up "正在备份全部工作项、密码和服务器配置"; then
    rollback_update status_write_failed
    return 1
  fi
  if ! create_backup; then
    rollback_update backup_failed
    return 1
  fi
  if ! write_transaction backup_ready; then
    rollback_update transaction_write_failed
    return 1
  fi

  if ! write_status restarting restarting "备份已完成，正在启动新版本"; then
    rollback_update status_write_failed
    return 1
  fi
  if ! write_transaction switching; then
    rollback_update transaction_write_failed
    return 1
  fi
  if ! set_env_image "$NEW_IMAGE"; then
    rollback_update env_update_failed
    return 1
  fi
  if ! compose up -d --no-deps fishdesk; then
    rollback_update compose_start_failed
    return 1
  fi

  if ! write_status verifying verifying "正在检查新版本和数据文件是否正常"; then
    rollback_update status_write_failed
    return 1
  fi
  if ! write_transaction verifying; then
    rollback_update transaction_write_failed
    return 1
  fi
  if ! verify_health; then
    rollback_update health_check_failed
    return 1
  fi
  if ! save_current_version "$MANIFEST_VERSION"; then
    rollback_update version_save_failed
    return 1
  fi
  CURRENT_VERSION=$MANIFEST_VERSION
  if ! write_transaction committed; then
    rollback_update transaction_write_failed
    return 1
  fi
  retain_backups || true
  write_status succeeded succeeded "FishDesk 升级成功，全部数据已保留" || return 1
  rm -f -- "$PROCESSING_FILE" || return 1
  clear_transaction || return 1
  return 0
}

process_request() {
  local result
  if [[ -f "$TRANSACTION_FILE" ]]; then
    recover_interrupted_update
    return $?
  fi
  if [[ ! -f "$PROCESSING_FILE" ]]; then
    [[ -f "$REQUEST_FILE" ]] || return 0
    mv -f -- "$REQUEST_FILE" "$PROCESSING_FILE" 2>/dev/null || return 0
  fi
  run_update
  result=$?
  if [[ ! -f "$TRANSACTION_FILE" ]]; then
    rm -f -- "$PROCESSING_FILE"
  fi
  return "$result"
}

initialize() {
  local command
  for command in docker curl tar flock du df; do
    command -v "$command" >/dev/null 2>&1 || { printf '缺少必要命令：%s\n' "$command" >&2; return 1; }
  done
  mkdir -p "$UPDATE_DIR/requests" "$STATUS_DIR" "$BACKUP_DIR" || return 1
  [[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || { printf '在 %s 中找不到 FishDesk 部署文件\n' "$ROOT" >&2; return 1; }
  detect_compose || { printf 'Docker Compose 不可用\n' >&2; return 1; }
  exec 9>"$UPDATE_DIR/updater.lock" || return 1
  flock -n 9 || exit 0
  CURRENT_VERSION=$(read_current_version)
  LATEST_VERSION=$CURRENT_VERSION
  if [[ ! -f "$STATUS_FILE" ]]; then
    write_status idle idle "等待网页提交升级请求" || return 1
  fi
}

main() {
  initialize || exit 1
  if [[ ${1:-} == "--once" ]]; then
    process_request
    exit $?
  fi
  while true; do
    process_request || true
    sleep 2
  done
}

main "$@"
