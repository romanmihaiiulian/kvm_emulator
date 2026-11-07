// Serves web/ on localhost. The page talks to the VMs directly over WebSocket.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = fileURLToPath(new URL("./web", import.meta.url));
const PORT = Number(process.env.KVM_WEB_PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = normalize(join(WEB_ROOT, path === "/" ? "index.html" : path));
  try {
    if (!file.startsWith(WEB_ROOT + sep)) throw new Error("outside web root");
    if (!(await stat(file)).isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`KVM console: http://127.0.0.1:${PORT}/`);
});
