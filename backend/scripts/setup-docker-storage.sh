#!/usr/bin/env bash
set -euo pipefail

mkdir -p /mnt/d/Realgravity/docker-data
cat <<EOF > /etc/docker/daemon.json
{
  "data-root": "/mnt/d/Realgravity/docker-data"
}
EOF

systemctl restart docker
docker info | grep 'Docker Root Dir'
