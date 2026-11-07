#!/bin/sh
# Runs inside the guest. "base" installs software; a role name personalises a
# copy of that base. Printing the marker at the end tells scripts/setup it worked.

# The serial login prompt hangs up the serial port when it starts, which would cut
# off this script's output and its marker. Keep it away for this boot only.
systemctl mask --runtime --now serial-getty@ttyAMA0.service || true
exec > /dev/ttyAMA0 2>&1

# Likewise keep the desktop off, so no app's first run happens before the demo's.
systemctl mask --runtime --now lightdm.service || true

set -eux

ROLE="$1"
SEED=/mnt/seed
HOME_DIR=/home/demo
LIB=/usr/local/lib/kvm-demo

provision_base() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    xorg xfce4 xfce4-terminal lightdm lightdm-gtk-greeter dbus-x11 \
    x11-xserver-utils wmctrl tmux htop python3 librsvg2-bin \
    firefox-esr libreoffice-writer libreoffice-gtk3 \
    fonts-dejavu-core fonts-liberation
  apt-get clean

  useradd -m -s /bin/bash demo
  echo 'demo:demo' | chpasswd

  # Log straight in, and never let X blank the display.
  mkdir -p /etc/lightdm/lightdm.conf.d
  cat > /etc/lightdm/lightdm.conf.d/50-kvm-demo.conf <<'EOF'
[Seat:*]
autologin-user=demo
autologin-user-timeout=0
autologin-session=xfce
xserver-command=X -s 0 -dpms
EOF
  systemctl set-default graphical.target

  # Nothing that could stall boot, sleep the VM or use CPU mid-talk.
  systemctl mask systemd-networkd-wait-online.service \
    sleep.target suspend.target hibernate.target hybrid-sleep.target \
    apt-daily.timer apt-daily-upgrade.timer man-db.timer e2scrub_all.timer fstrim.timer

  # Take the time zone from the host at boot, so the on-screen clocks are right.
  cat > /usr/local/sbin/kvm-demo-timezone <<'EOF'
#!/bin/sh
modprobe qemu_fw_cfg 2>/dev/null || true
f=/sys/firmware/qemu_fw_cfg/by_name/opt/kvm-demo/timezone/raw
[ -r "$f" ] || exit 0
tz="$(cat "$f")"
[ -f "/usr/share/zoneinfo/$tz" ] && ln -sf "/usr/share/zoneinfo/$tz" /etc/localtime
exit 0
EOF
  chmod 755 /usr/local/sbin/kvm-demo-timezone
  cat > /etc/systemd/system/kvm-demo-timezone.service <<'EOF'
[Unit]
Description=Set time zone from QEMU firmware config
Before=display-manager.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/kvm-demo-timezone

[Install]
WantedBy=multi-user.target
EOF
  systemctl enable kvm-demo-timezone.service
}

provision_role() {
  . "$SEED/$ROLE/role.env"

  echo "$HOSTNAME_LABEL" | tr 'A-Z' 'a-z' > /etc/hostname
  sed -i "/^127.0.1.1/d" /etc/hosts
  echo "127.0.1.1 $(cat /etc/hostname)" >> /etc/hosts

  mkdir -p "$LIB" /usr/share/backgrounds "$HOME_DIR/.config/autostart" \
    "$HOME_DIR/.config/xfce4/xfconf/xfce-perchannel-xml"

  sed -e "s/@LABEL@/$HOSTNAME_LABEL/g" -e "s/@PORT@/$PORT/g" \
      -e "s/@TITLE@/$TITLE/g" -e "s/@COLOR1@/$COLOR1/g" -e "s/@COLOR2@/$COLOR2/g" \
      "$SEED/common/wallpaper.svg" > /tmp/wallpaper.svg
  rsvg-convert -w 1280 -h 720 /tmp/wallpaper.svg -o /usr/share/backgrounds/kvm-demo.png

  XML="$HOME_DIR/.config/xfce4/xfconf/xfce-perchannel-xml"
  cp "$SEED/common/xfce4-desktop.xml" "$XML/xfce4-desktop.xml"
  cp /etc/xdg/xfce4/panel/default.xml "$XML/xfce4-panel.xml"  # skips the panel's first-run prompt
  cp "$SEED/common/kvm-demo-autostart.desktop" "$HOME_DIR/.config/autostart/kvm-demo.desktop"

  cp "$SEED/common/place-window.sh" "$LIB/place-window.sh"
  cp "$SEED/$ROLE/role-start" "$LIB/role-start"
  chmod 755 "$LIB/role-start"

  # Everything else the role ships, e.g. its app, goes in the demo user's home.
  if [ -d "$SEED/$ROLE/home" ]; then
    cp -R "$SEED/$ROLE/home/." "$HOME_DIR/"
  fi
  if [ -f "$SEED/$ROLE/install.sh" ]; then
    . "$SEED/$ROLE/install.sh"
  fi
  chown -R demo:demo "$HOME_DIR"

  # Provisioning is finished for good: later boots have no seed and no network.
  touch /etc/cloud/cloud-init.disabled
}

case "$ROLE" in
  base) provision_base ;;
  *) provision_role ;;
esac

fstrim -av || true
sync
echo KVM_PROVISION_OK
