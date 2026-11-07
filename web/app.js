import RFB from "./vendor/novnc/core/rfb.js";

const WORKSTATIONS = [
  { id: "dev", port: 1, name: "DEV-01", role: "Developer", ws: 5701 },
  { id: "ops", port: 2, name: "OPS-02", role: "Monitoring", ws: 5702 },
  { id: "doc", port: 3, name: "DOC-03", role: "Documents", ws: 5703 },
];
const RETRY_MS = 2000;
const THUMBNAIL_MS = 1000;
const OSD_MS = 2200;
const FLASH_MS = 180;
const CABLE_LANE_PX = 12;

const stations = new Map();
let activeId = null;
let osdTimer = null;

const $ = (id) => document.getElementById(id);

function buildStation(ws) {
  const screen = document.createElement("div");
  screen.className = "screen";
  screen.dataset.id = ws.id;
  $("screens").append(screen);

  const node = document.createElement("button");
  node.className = "station";
  node.type = "button";
  node.innerHTML = `
    <canvas class="thumb" width="320" height="180"></canvas>
    <span class="thumb-no-signal">No signal</span>
    <span class="station-text"><b>${ws.name}</b> <span>${ws.role}</span></span>
    <span class="station-state"></span>`;
  node.addEventListener("click", () => select(ws.id));
  $("workstations").append(node);

  const led = document.createElement("div");
  led.className = "led";
  led.innerHTML = `<i></i><span>${ws.port}</span>`;
  $("leds").append(led);

  const station = { ...ws, screen, node, led, thumb: node.querySelector(".thumb"), rfb: null, online: false };
  stations.set(ws.id, station);
  return station;
}

function connect(station) {
  const rfb = new RFB(station.screen, `ws://127.0.0.1:${station.ws}/`, { shared: true });
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.focusOnClick = station.id === activeId;
  rfb.viewOnly = station.id !== activeId;
  station.rfb = rfb;

  rfb.addEventListener("connect", () => {
    station.online = true;
    render();
    if (station.id === activeId) rfb.focus();
  });
  // A VM being down must not affect the others: mark it and keep retrying.
  rfb.addEventListener("disconnect", () => {
    station.online = false;
    station.rfb = null;
    render();
    setTimeout(() => connect(station), RETRY_MS);
  });
  // When Chrome's GPU process resets, it gives the canvases back blank, and noVNC
  // only redraws what changes next. Ask the VM for its whole screen again.
  rfb._display._backbuffer.addEventListener("contextrestored", () => {
    if (station.rfb !== rfb || !station.online) return;
    RFB.messages.fbUpdateRequest(rfb._sock, false, 0, 0, rfb._fbWidth, rfb._fbHeight);
  });
}

function select(id) {
  if (id === activeId) {
    stations.get(id).rfb?.focus();
    return;
  }
  const previous = stations.get(activeId);
  const next = stations.get(id);

  if (previous?.rfb) {
    // Release held keys before going view-only: noVNC's own release on that
    // change is dropped, because it sets the flag first. This is a private call,
    // which is safe here because noVNC is vendored at a fixed version.
    previous.rfb._keyboard._allKeysUp();
    previous.rfb.viewOnly = true;
    previous.rfb.focusOnClick = false;
  }
  activeId = id;

  // Render first: browsers won't focus the canvas while its screen is hidden.
  render();
  if (next.rfb) {
    next.rfb.viewOnly = false;
    next.rfb.focusOnClick = true;
    next.rfb.focus();
  }

  flash();
  showOsd(`PORT ${next.port} — ${next.name}`);
}

function flash() {
  const el = $("flash");
  el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), FLASH_MS);
}

function showOsd(text) {
  const el = $("osd");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => el.classList.remove("on"), OSD_MS);
}

function render() {
  for (const s of stations.values()) {
    const active = s.id === activeId;
    s.screen.classList.toggle("active", active);
    s.node.classList.toggle("active", active);
    s.node.classList.toggle("offline", !s.online);
    s.node.setAttribute("aria-pressed", String(active));
    s.node.querySelector(".station-state").textContent =
      !s.online ? "No signal" : active ? "In control" : "Running";
    s.led.classList.toggle("active", active);
    s.led.classList.toggle("offline", !s.online);
  }
  const current = stations.get(activeId);
  $("monitor-label").textContent = current ? `Port ${current.port} · ${current.name}` : "";
  $("flash").parentElement.classList.toggle("no-signal", !current?.online);
  drawCables();
}

// noVNC draws into a <canvas> inside each screen, which keeps updating even for
// the unselected machines. Copying it gives the diagram its live thumbnails.
function drawThumbnails() {
  for (const s of stations.values()) {
    const source = s.screen.querySelector("canvas");
    if (!s.online || !source || !source.width) continue;
    s.thumb.getContext("2d").drawImage(source, 0, 0, s.thumb.width, s.thumb.height);
  }
}

function box(el) {
  const stage = $("cables").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    top: r.top - stage.top,
    bottom: r.bottom - stage.top,
    right: r.right - stage.left,
    midX: r.left - stage.left + r.width / 2,
    midY: r.top - stage.top + r.height / 2,
  };
}

function drawCables() {
  const svg = $("cables");
  const kvm = box($("kvm"));
  const cables = [];

  // Each workstation's cable runs down its own lane beside the stack, so it can't
  // pass behind another workstation. The top one takes the outermost lane.
  const list = [...stations.values()];
  list.forEach((s, i) => {
    const from = box(s.node);
    const lane = from.right + CABLE_LANE_PX * (list.length - i);
    cables.push({
      d: `M${from.right} ${from.midY} H${lane} V${kvm.top}`,
      live: s.id === activeId && s.online,
      dead: !s.online,
    });
  });
  for (const id of ["p-monitor", "p-keyboard", "p-mouse"]) {
    const to = box($(id));
    cables.push({ d: `M${to.midX} ${kvm.bottom} V${to.top}`, live: true, dead: false });
  }
  cables.sort((a, b) => a.live - b.live); // the lit path always draws on top

  svg.replaceChildren(...cables.map(({ d, live, dead }) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", `cable${live ? " live" : ""}${dead ? " dead" : ""}`);
    return path;
  }));
}

for (const ws of WORKSTATIONS) buildStation(ws);
activeId = WORKSTATIONS[0].id;
render();
for (const s of stations.values()) connect(s);

setInterval(drawThumbnails, THUMBNAIL_MS);
window.addEventListener("resize", drawCables);
document.fonts?.ready.then(drawCables);
