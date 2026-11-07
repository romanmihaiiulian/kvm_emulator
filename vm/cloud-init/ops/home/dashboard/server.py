"""Serves the dashboard and this VM's real CPU, memory and uptime figures."""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def read_cpu():
    with open("/proc/stat") as f:
        values = [int(v) for v in f.readline().split()[1:]]
    return sum(values), values[3] + values[4]


last_total, last_idle = read_cpu()


def metrics():
    global last_total, last_idle
    total, idle = read_cpu()
    span = max(total - last_total, 1)
    cpu = 100 * (1 - (idle - last_idle) / span)
    last_total, last_idle = total, idle

    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, value = line.split(":")
            mem[key] = int(value.split()[0])
    used = 100 * (1 - mem["MemAvailable"] / mem["MemTotal"])

    with open("/proc/uptime") as f:
        uptime = float(f.read().split()[0])
    return {"cpu": cpu, "mem": used, "uptime": uptime, "load": os.getloadavg()[0]}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/metrics":
            return super().do_GET()
        body = json.dumps(metrics()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
