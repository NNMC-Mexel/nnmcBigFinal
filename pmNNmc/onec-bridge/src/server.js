const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const host = process.env.ONEC_BRIDGE_HOST || "127.0.0.1";
const port = parseInt(process.env.ONEC_BRIDGE_PORT || "12110", 10);
const token = String(process.env.ONEC_BRIDGE_TOKEN || "").trim();
const timeoutMs = parseInt(process.env.ONEC_BRIDGE_TIMEOUT_MS || "120000", 10);
const listLimit = Math.max(1, Math.min(parseInt(process.env.ONEC_BRIDGE_LIST_LIMIT || "500", 10), 2000));
const scriptPath = path.resolve(__dirname, "../scripts/invoke-onec.ps1");

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function requireConfig() {
  const missing = ["ONEC_BRIDGE_TOKEN", "ONEC_SERVER", "ONEC_DATABASE"]
    .filter((name) => !String(process.env[name] || "").trim());
  const hasCredentialFile = Boolean(String(process.env.ONEC_CREDENTIAL_PATH || "").trim());
  const hasPlainCredential = Boolean(
    String(process.env.ONEC_USER || "").trim() && String(process.env.ONEC_PASSWORD || "").trim()
  );
  if (!hasCredentialFile && !hasPlainCredential) {
    missing.push("ONEC_CREDENTIAL_PATH or ONEC_USER+ONEC_PASSWORD");
  }
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function authorized(req) {
  const supplied = String(req.headers["x-bridge-token"] || "");
  if (token.length < 24) return false;
  const expectedBuffer = Buffer.from(token, "utf8");
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function toBase64Url(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

function invokeOneC(action, input) {
  return new Promise((resolve, reject) => {
    requireConfig();

    const inputBase64 = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Action",
        action,
        "-InputBase64",
        inputBase64,
      ],
      {
        windowsHide: true,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("1C request timed out"));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `1C process exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || "null"));
      } catch {
        reject(new Error(`Invalid response from 1C bridge script: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const hasCredentials = Boolean(
        process.env.ONEC_CREDENTIAL_PATH || (process.env.ONEC_USER && process.env.ONEC_PASSWORD)
      );
      sendJson(res, 200, { ok: true, configured: Boolean(token && hasCredentials) });
      return;
    }

    if (!authorized(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/timesheets") {
      const year = parseInt(url.searchParams.get("year") || "0", 10);
      const month = parseInt(url.searchParams.get("month") || "0", 10);
      const items = await invokeOneC("list", {
        year: Number.isFinite(year) ? year : 0,
        month: Number.isFinite(month) ? month : 0,
        limit: listLimit,
      });
      const result = (Array.isArray(items) ? items : []).map((item) => ({
        ...item,
        id: toBase64Url({ number: item.number, date: item.date }),
      }));
      sendJson(res, 200, { items: result });
      return;
    }

    const detailMatch = req.method === "GET" && url.pathname.match(/^\/timesheets\/([^/]+)$/);
    if (detailMatch) {
      const identity = fromBase64Url(decodeURIComponent(detailMatch[1]));
      if (!identity?.number || !identity?.date) {
        sendJson(res, 400, { error: "Invalid timesheet id" });
        return;
      }
      const item = await invokeOneC("detail", identity);
      if (!item) {
        sendJson(res, 404, { error: "Timesheet not found" });
        return;
      }
      sendJson(res, 200, item);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(`[onec-bridge] ${error?.stack || error}`);
    sendJson(res, 500, { error: error?.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`[onec-bridge] listening on http://${host}:${port}`);
});
