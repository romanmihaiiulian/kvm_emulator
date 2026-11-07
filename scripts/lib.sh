# Shared settings and helpers for the scripts in this folder. Source, don't run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGES="$ROOT/vm/images"
RUN="$ROOT/vm/run"
SEEDS="$ROOT/vm/cloud-init"

DEBIAN_URL="https://cloud.debian.org/images/cloud/trixie/latest"
DEBIAN_IMAGE="debian-13-generic-arm64.qcow2"

ROLES=(dev ops doc)
WEB_PORT="${KVM_WEB_PORT:-8080}"
VM_MEM="${KVM_VM_MEM:-2048}"   # MiB per VM. Lower this on a Mac with little RAM.
VM_CPUS="${KVM_VM_CPUS:-2}"

# Port 1..3 for a role, which also picks its VNC display and WebSocket port.
role_port() {
  case "$1" in
    dev) echo 1 ;;
    ops) echo 2 ;;
    doc) echo 3 ;;
    *) echo "unknown role: $1" >&2; return 1 ;;
  esac
}
role_ws_port() { echo $((5700 + $(role_port "$1"))); }

log() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

firmware() {
  local fw
  fw="$(brew --prefix qemu 2>/dev/null)/share/qemu/edk2-aarch64-code.fd"
  [ -f "$fw" ] || die "UEFI firmware not found. Is QEMU installed? (brew install qemu)"
  echo "$fw"
}

# Arguments every VM shares. The disk, network and display are added by callers.
qemu_common() {
  echo -M virt -accel hvf -cpu host -smp "$VM_CPUS" -m "$VM_MEM" \
    -device virtio-gpu-pci,xres=1280,yres=720 \
    -device qemu-xhci -device usb-kbd -device usb-tablet
}

pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
