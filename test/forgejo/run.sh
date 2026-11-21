#!/usr/bin/env bash
# Runs the Forgejo action test: builds FencePost's container image from this
# checkout, saves it, and runs the NixOS VM test with it. Needs Docker and
# Nix, and KVM for a reasonable run time. Leaves no Docker image behind.
#   test/forgejo/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
work="$(mktemp -d)"
trap 'docker rmi -f fencepost:forgejo-test >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
docker build --target production -t fencepost:forgejo-test .
docker save fencepost:forgejo-test | gzip -1 >"$work/fencepost.tar.gz"
nix-build test/forgejo --no-out-link --arg fencepostImage "$work/fencepost.tar.gz" "$@"
