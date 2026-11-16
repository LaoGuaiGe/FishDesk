#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
umask 077

readonly ROOT=/opt/fishdesk
readonly IMAGE_NAME=ghcr.io/laoguaige/fishdesk
readonly MANIFEST_URL=https://github.com/LaoGuaiGe/FishDesk/releases/latest/download/release.json
readonly SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly PROJECT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

require_root() {
  if (( EUID != 0 )); then
    printf '请在宝塔终端中使用 root 用户运行安装脚本。\n' >&2
    exit 1
  fi
  local command
  for command in docker curl tar flock systemctl du df; do
    command -v "$command" >/dev/null 2>&1 || { printf '服务器缺少必要命令：%s\n' "$command" >&2; exit 1; }
  done
  if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    printf '请先在宝塔面板中安装 Docker Compose。\n' >&2
    exit 1
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose --env-file "$ROOT/.env" -f "$ROOT/docker-compose.yml" "$@"
  else
    docker-compose --env-file "$ROOT/.env" -f "$ROOT/docker-compose.yml" "$@"
  fi
}

fetch_release() {
  local tmp json size pattern
  tmp=$(mktemp)
  trap 'rm -f -- "$tmp"' RETURN
  curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 30 \
    --proto '=https' --proto-redir '=https' \
    --output "$tmp" "$MANIFEST_URL"
  size=$(wc -c < "$tmp")
  if (( size > 4096 )); then
    printf '官方发布信息大小异常，安装已取消。\n' >&2
    return 1
  fi
  json=$(<"$tmp")
  pattern='^\{"version":"([0-9]+\.[0-9]+\.[0-9]+)","image":"(ghcr\.io/laoguaige/fishdesk)","digest":"(sha256:[0-9a-f]{64})","minUpdaterVersion":([0-9]+),"createdAt":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)"\}$'
  if [[ ! "$json" =~ $pattern ]]; then
    printf '官方发布信息校验失败，安装已取消。\n' >&2
    return 1
  fi
  RELEASE_VERSION=${BASH_REMATCH[1]}
  [[ ${BASH_REMATCH[2]} == "$IMAGE_NAME" ]]
  RELEASE_DIGEST=${BASH_REMATCH[3]}
  if [[ ! ${BASH_REMATCH[4]} =~ ^0+$|^0*1$ ]]; then
    printf '当前安装脚本版本过旧，请先获取最新安装脚本。\n' >&2
    return 1
  fi
  RELEASE_IMAGE="$IMAGE_NAME@$RELEASE_DIGEST"
  rm -f -- "$tmp"
  trap - RETURN
}

has_password() {
  local line
  [[ -f "$ROOT/.env" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      FISHDESK_PASSWORD=?*) return 0 ;;
    esac
  done < "$ROOT/.env"
  return 1
}

prompt_password() {
  local password confirmation
  if [[ -n ${FISHDESK_PASSWORD:-} ]]; then
    password=$FISHDESK_PASSWORD
  else
    if [[ ! -t 0 ]]; then
      printf '首次安装需要设置密码，请在宝塔终端中交互运行本脚本。\n' >&2
      return 1
    fi
    read -r -s -p '请设置 FishDesk 登录密码：' password
    printf '\n'
    read -r -s -p '请再次输入登录密码：' confirmation
    printf '\n'
    [[ "$password" == "$confirmation" ]] || { printf '两次输入的密码不一致。\n' >&2; return 1; }
  fi
  [[ -n "$password" ]] || { printf '登录密码不能为空。\n' >&2; return 1; }
  [[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || { printf '登录密码不能包含换行符。\n' >&2; return 1; }
  PASSWORD_VALUE=${password//\'/\\\'}
}

write_env() {
  local tmp line found_image=0 found_password=0
  tmp=$(mktemp "$ROOT/.env.XXXXXX")
  if [[ -f "$ROOT/.env" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      case "$line" in
        FISHDESK_IMAGE=*)
          if (( found_image == 0 )); then
            printf 'FISHDESK_IMAGE=%s\n' "$RELEASE_IMAGE" >> "$tmp"
            found_image=1
          fi
          ;;
        FISHDESK_PASSWORD=*)
          if (( found_password == 0 )); then
            if [[ -n ${PASSWORD_VALUE:-} ]]; then
              printf "FISHDESK_PASSWORD='%s'\n" "$PASSWORD_VALUE" >> "$tmp"
            else
              printf '%s\n' "$line" >> "$tmp"
            fi
            found_password=1
          fi
          ;;
        *) printf '%s\n' "$line" >> "$tmp" ;;
      esac
    done < "$ROOT/.env"
  fi
  if (( found_image == 0 )); then
    printf 'FISHDESK_IMAGE=%s\n' "$RELEASE_IMAGE" >> "$tmp"
  fi
  if (( found_password == 0 )); then
    [[ -n ${PASSWORD_VALUE:-} ]] || { rm -f -- "$tmp"; printf '未设置登录密码，安装已取消。\n' >&2; return 1; }
    printf "FISHDESK_PASSWORD='%s'\n" "$PASSWORD_VALUE" >> "$tmp"
  fi
  chmod 0600 "$tmp"
  mv -f -- "$tmp" "$ROOT/.env"
}

write_initial_state() {
  local tmp updated_at
  tmp=$(mktemp "$ROOT/update/.current-version.XXXXXX")
  printf '%s\n' "$RELEASE_VERSION" > "$tmp"
  mv -f -- "$tmp" "$ROOT/update/current-version"
  if [[ ! -f "$ROOT/update/status/status.json" ]]; then
    updated_at=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    tmp=$(mktemp "$ROOT/update/status/.status.json.XXXXXX")
    printf '{"state":"idle","phase":"idle","message":"等待网页提交升级请求","currentVersion":"%s","latestVersion":"%s","backup":"","error":"","updatedAt":"%s"}\n' \
      "$RELEASE_VERSION" "$RELEASE_VERSION" "$updated_at" > "$tmp"
    chmod 0644 "$tmp"
    mv -f -- "$tmp" "$ROOT/update/status/status.json"
  fi
}

install_files() {
  if [[ "$SCRIPT_DIR" != "$ROOT/deploy" ]]; then
    install -m 0755 "$SCRIPT_DIR/fishdesk-updater.sh" "$ROOT/deploy/fishdesk-updater.sh"
  else
    chmod 0755 "$ROOT/deploy/fishdesk-updater.sh"
  fi
  install -m 0644 "$SCRIPT_DIR/fishdesk-updater.service" /etc/systemd/system/fishdesk-updater.service
  if [[ ! -f "$ROOT/docker-compose.yml" ]]; then
    [[ -f "$PROJECT_DIR/docker-compose.yml" ]] || { printf '安装包中缺少 docker-compose.yml。\n' >&2; return 1; }
    install -m 0644 "$PROJECT_DIR/docker-compose.yml" "$ROOT/docker-compose.yml"
  fi
}

main() {
  require_root
  mkdir -p "$ROOT/deploy" "$ROOT/update/requests" "$ROOT/update/status" "$ROOT/backups"
  chmod 0770 "$ROOT/update/requests"
  fetch_release
  if ! has_password; then
    prompt_password
  fi
  docker pull "$RELEASE_IMAGE"
  install_files
  write_env
  compose up -d fishdesk
  write_initial_state
  systemctl daemon-reload
  systemctl enable fishdesk-updater.service
  systemctl restart fishdesk-updater.service
  printf 'FishDesk %s 安装完成。请在宝塔 Nginx 中将域名反向代理到 http://127.0.0.1:18080。\n' "$RELEASE_VERSION"
}

main "$@"
