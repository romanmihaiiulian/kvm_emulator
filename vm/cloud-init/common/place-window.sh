# Sourced by each role-start. Keeps the screen awake and positions the main
# window below the wallpaper's hostname banner, so the banner stays readable.

xset s off -dpms s noblank 2>/dev/null || true

move_window() {
  wmctrl -r "$1" -b remove,maximized_vert,maximized_horz
  wmctrl -r "$1" -e "0,24,$2,1232,$3"
}

# place_window <title substring> [y] [height]: waits for the window, up to two minutes.
place_window() {
  y="${2:-104}"
  height="${3:-584}"
  i=0
  while [ "$i" -lt 240 ]; do
    if wmctrl -l | grep -qi "$1"; then
      move_window "$1" "$y" "$height"
      wmctrl -a "$1"
      # Some apps, such as LibreOffice, resize themselves once they finish loading.
      sleep 3
      move_window "$1" "$y" "$height"
      # The desktop doesn't always repaint where the window used to be.
      sleep 1
      xrefresh
      return 0
    fi
    i=$((i + 1))
    sleep 0.5
  done
  return 1
}
