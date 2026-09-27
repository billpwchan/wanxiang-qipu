#!/usr/bin/env bash
set -euo pipefail
release="$1"
archive="$2"
[[ "$release" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 2
base=/opt/wanxiang
site_fragment=/config/sites-enabled/wanxiang.caddy
# Initial installation only: refuse to overwrite any existing app or fragment.
! docker container inspect wanxiang-guide >/dev/null 2>&1
! docker exec jchart-shared-gateway test -e "$site_fragment"
test ! -e "$base/current"
sudo install -d -m 755 "$base/releases/$release" "$base/deploy"
docker inspect --format '{{.Name}} {{.State.Status}} {{.RestartCount}} {{.State.StartedAt}}' $(docker ps -q) | sort | sudo tee "$base/deploy/before-containers.txt" >/dev/null
docker exec jchart-shared-gateway sh -c 'sha256sum /config/sites-enabled/*' | sudo tee "$base/deploy/before-config.sha256" >/dev/null
sudo tar -xzf "$archive" -C "$base/releases/$release"
sudo chmod -R a+rX "$base/releases/$release"
sudo install -m 644 /tmp/wanxiang-Caddyfile "$base/Caddyfile"
sudo install -m 644 /tmp/wanxiang-site.caddy "$base/deploy/wanxiang.caddy"
sudo ln -s "releases/$release" "$base/current"
docker run -d --name wanxiang-guide --restart unless-stopped \
 --network jchart_gateway --memory 96m --memory-swap 96m --cpus .25 --pids-limit 64 \
 --read-only --user 65534:65534 --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true \
 --tmpfs /tmp:rw,noexec,nosuid,size=8m,mode=1777 \
 --tmpfs /config:rw,noexec,nosuid,size=4m,mode=1777 \
 --tmpfs /data:rw,noexec,nosuid,size=4m,mode=1777 \
 -e GOMEMLIMIT=64MiB \
 --mount "type=bind,src=$base,dst=/srv,readonly" \
 --mount "type=bind,src=$base/Caddyfile,dst=/etc/caddy/Caddyfile,readonly" \
 --health-cmd 'wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1' \
 --health-interval 30s --health-timeout 3s --health-start-period 5s --health-retries 3 \
 --log-opt max-size=5m --log-opt max-file=2 \
 caddy:2.10-alpine >/dev/null
for attempt in 1 2 3 4 5; do
 if docker exec jchart-shared-gateway wget -q -O /dev/null http://wanxiang-guide:8080/healthz; then break; fi
 if [ "$attempt" = 5 ]; then echo 'New site health check failed; gateway unchanged.'; exit 1; fi
 sleep 1
done
# Only our new fragment is added. Validation precedes a graceful live reload.
docker cp "$base/deploy/wanxiang.caddy" "jchart-shared-gateway:$site_fragment"
rollback_fragment() {
 docker exec jchart-shared-gateway rm -f "$site_fragment"
 docker exec jchart-shared-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
}
if ! docker exec jchart-shared-gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
 rollback_fragment
 echo 'Gateway validation failed; only the new fragment was removed.'
 exit 1
fi
if ! docker exec jchart-shared-gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
 rollback_fragment
 echo 'Gateway reload failed; new fragment rolled back.'
 exit 1
fi
# Exact baseline comparisons: other fragments and every previous container.
sudo cat "$base/deploy/before-config.sha256" | docker exec -i jchart-shared-gateway sha256sum -c -
docker inspect --format '{{.Name}} {{.State.Status}} {{.RestartCount}} {{.State.StartedAt}}' $(docker ps -q) | grep -v '^/wanxiang-guide ' | sort | sudo tee "$base/deploy/after-containers.txt" >/dev/null
diff "$base/deploy/before-containers.txt" "$base/deploy/after-containers.txt"
printf 'Release %s deployed. Existing containers and configurations unchanged.\n' "$release"
