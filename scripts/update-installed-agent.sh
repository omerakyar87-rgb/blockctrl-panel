#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
agent_target=/opt/blockctrl/agent
agent_service=blockctrl-agent.service
cd "$repo_dir/agent"

npx --yes pnpm@10.34.5 install --frozen-lockfile
npx --yes pnpm@10.34.5 build
for file in index.js performance.js performance-metrics.js runtime-optimizer.js optimization-mods.js; do
  test -s "dist/$file"
done
sudo test -f "$agent_target/dist/index.js"
backup_dir="$agent_target/dist.backup.$(date +%s)"
sudo cp -a "$agent_target/dist" "$backup_dir"
rollback() {
  trap - ERR
  printf 'Agent güncellemesi başarısız. Önceki dosyalar geri yükleniyor: %s\n' "$backup_dir" >&2
  sudo cp -a "$backup_dir/." "$agent_target/dist/"
  sudo systemctl start "$agent_service"
  exit 1
}
trap rollback ERR
sudo systemctl stop "$agent_service"
sudo install -o blockctrl -g blockctrl -m 0644 dist/index.js dist/performance.js dist/performance-metrics.js dist/runtime-optimizer.js dist/optimization-mods.js "$agent_target/dist/"
sudo systemctl start "$agent_service"
# Confirm service stays active beyond initial startup.
for attempt in 1 2 3; do
  sleep 2
  sudo systemctl is-active --quiet "$agent_service"
done
trap - ERR
printf 'Agent güncellendi. Yedek: %s\n' "$backup_dir"
sudo systemctl status "$agent_service" --no-pager --lines=5
