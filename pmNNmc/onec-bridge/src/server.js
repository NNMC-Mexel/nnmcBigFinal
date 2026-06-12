const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
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
const dailyListLimit = Math.max(
  listLimit,
  Math.min(parseInt(process.env.ONEC_BRIDGE_DAILY_LIST_LIMIT || "10000", 10), 10000)
);
const dailySyncHour = Math.max(0, Math.min(parseInt(process.env.ONEC_BRIDGE_DAILY_SYNC_HOUR || "7", 10), 23));
const dataDir = path.resolve(process.env.ONEC_BRIDGE_DATA_DIR || path.resolve(__dirname, "../data"));
const cachePath = path.join(dataDir, "cache.json");
const scriptPath = path.resolve(__dirname, "../scripts/invoke-onec.ps1");
const cache = new Map();
const inFlight = new Map();
const syncState = { lastDailySyncAt: "", running: false, lastError: "" };
let oneCQueue = Promise.resolve();
let persistQueue = Promise.resolve();

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

function normalizeCachePart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[\s\-_]+/g, "")
    .replace(/^OCMK/, "ОЦМК");
}

function shouldRefresh(value) {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function getCached(key) {
  const entry = cache.get(key);
  return entry || null;
}

function setCached(key, value, source) {
  const entry = {
    value,
    source,
    updatedAt: new Date().toISOString(),
  };
  cache.set(key, entry);
  return entry;
}

function deleteCachePrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function cacheSnapshot() {
  return {
    version: 1,
    syncState,
    entries: Object.fromEntries(cache.entries()),
  };
}

function persistCache() {
  persistQueue = persistQueue
    .catch(() => {})
    .then(async () => {
      fs.mkdirSync(dataDir, { recursive: true });
      await fs.promises.writeFile(cachePath, JSON.stringify(cacheSnapshot()), "utf8");
    });
  return persistQueue;
}

function loadCache() {
  try {
    const stored = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    for (const [key, entry] of Object.entries(stored?.entries || {})) {
      if (entry && Object.prototype.hasOwnProperty.call(entry, "value")) {
        cache.set(key, entry);
      }
    }
    syncState.lastDailySyncAt = String(stored?.syncState?.lastDailySyncAt || "");
    syncState.lastError = String(stored?.syncState?.lastError || "");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`[onec-bridge] failed to load cache: ${error?.message || error}`);
    }
  }
}

async function cachedInvoke(key, refresh, loader) {
  if (!refresh) {
    const cached = getCached(key);
    if (cached) return { entry: cached, hit: true };
  }

  if (inFlight.has(key)) {
    return { entry: await inFlight.get(key), hit: false };
  }

  const request = Promise.resolve()
    .then(loader)
    .then((value) => setCached(key, value, refresh ? "manual-refresh" : "on-demand"))
    .then(async (entry) => {
      await persistCache();
      return entry;
    });
  inFlight.set(key, request);
  try {
    return { entry: await request, hit: false };
  } finally {
    inFlight.delete(key);
  }
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

function enqueueOneC(action, input) {
  const request = oneCQueue.then(() => invokeOneC(action, input));
  oneCQueue = request.catch(() => {});
  return request;
}

function monthIdentity(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function automaticMonths(now = new Date()) {
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [monthIdentity(previous), monthIdentity(current)];
}

function snapshotKey(year, month) {
  return `snapshot:${year}:${month}`;
}

function departmentListKey(year, month, department) {
  return `list:${year}:${month}:${normalizeCachePart(department)}`;
}

function sameLocalDate(isoValue, date = new Date()) {
  if (!isoValue) return false;
  const value = new Date(isoValue);
  return (
    !Number.isNaN(value.getTime())
    && value.getFullYear() === date.getFullYear()
    && value.getMonth() === date.getMonth()
    && value.getDate() === date.getDate()
  );
}

async function runDailySync(reason = "schedule") {
  if (syncState.running) return;
  syncState.running = true;
  syncState.lastError = "";
  console.log(`[onec-bridge] daily sync started (${reason})`);

  try {
    const activeSnapshotKeys = new Set();
    const activeDetailKeys = new Set();

    for (const { year, month } of automaticMonths()) {
      const items = await enqueueOneC("list", {
        year,
        month,
        department: "",
        limit: dailyListLimit,
      });
      const monthItems = Array.isArray(items) ? items : [];
      const monthSnapshotKey = snapshotKey(year, month);
      activeSnapshotKeys.add(monthSnapshotKey);
      for (const item of monthItems) {
        activeDetailKeys.add(`detail:${toBase64Url({ number: item.number, date: item.date })}`);
      }
      setCached(monthSnapshotKey, monthItems, "daily-sync");
      deleteCachePrefix(`list:${year}:${month}:`);
    }

    const cachedDetailKeys = [];
    for (const key of cache.keys()) {
      if (key.startsWith("snapshot:") && !activeSnapshotKeys.has(key)) {
        cache.delete(key);
      } else if (key.startsWith("list:")) {
        cache.delete(key);
      } else if (key.startsWith("detail:")) {
        if (activeDetailKeys.has(key)) cachedDetailKeys.push(key);
        else cache.delete(key);
      }
    }

    for (const key of cachedDetailKeys) {
      const identity = fromBase64Url(key.slice("detail:".length));
      const item = await enqueueOneC("detail", identity);
      if (item) setCached(key, item, "daily-sync");
      else cache.delete(key);
    }

    syncState.lastDailySyncAt = new Date().toISOString();
    await persistCache();
    console.log(
      `[onec-bridge] daily sync completed at ${syncState.lastDailySyncAt}; `
      + `refreshed cached details: ${cachedDetailKeys.length}`
    );
  } catch (error) {
    syncState.lastError = error?.message || String(error);
    await persistCache().catch(() => {});
    console.error(`[onec-bridge] daily sync failed: ${syncState.lastError}`);
  } finally {
    syncState.running = false;
  }
}

function scheduleDailySync() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(dailySyncHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = Math.max(1000, next.getTime() - now.getTime());
  console.log(`[onec-bridge] next daily sync: ${next.toString()}`);
  setTimeout(async () => {
    await runDailySync("schedule");
    scheduleDailySync();
  }, delay);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const hasCredentials = Boolean(
        process.env.ONEC_CREDENTIAL_PATH || (process.env.ONEC_USER && process.env.ONEC_PASSWORD)
      );
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(token && hasCredentials),
        cacheEntries: cache.size,
        lastDailySyncAt: syncState.lastDailySyncAt || null,
        dailySyncRunning: syncState.running,
        dailySyncHour,
        lastDailySyncError: syncState.lastError || null,
      });
      return;
    }

    if (!authorized(req)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/timesheets") {
      const year = parseInt(url.searchParams.get("year") || "0", 10);
      const month = parseInt(url.searchParams.get("month") || "0", 10);
      const department = String(url.searchParams.get("department") || "").trim();
      const refresh = shouldRefresh(url.searchParams.get("refresh"));
      const normalizedYear = Number.isFinite(year) ? year : 0;
      const normalizedMonth = Number.isFinite(month) ? month : 0;
      const cacheKey = departmentListKey(normalizedYear, normalizedMonth, department);
      let entry = refresh ? null : getCached(cacheKey);
      if (!entry && !refresh) {
        entry = getCached(snapshotKey(normalizedYear, normalizedMonth));
      }
      let hit = Boolean(entry);
      if (!entry) {
        const result = await cachedInvoke(cacheKey, refresh, () =>
          enqueueOneC("list", {
            year: normalizedYear,
            month: normalizedMonth,
            department,
            limit: listLimit,
          })
        );
        entry = result.entry;
        hit = result.hit;
      }
      const items = Array.isArray(entry?.value) ? entry.value : [];
      const filteredItems = department
        ? items.filter((item) => normalizeCachePart(item?.department) === normalizeCachePart(department))
        : items;
      const result = filteredItems.map((item) => ({
        ...item,
        id: toBase64Url({ number: item.number, date: item.date }),
      }));
      sendJson(res, 200, {
        items: result,
        cache: {
          hit,
          source: entry?.source || null,
          updatedAt: entry?.updatedAt || null,
        },
      });
      return;
    }

    const detailMatch = req.method === "GET" && url.pathname.match(/^\/timesheets\/([^/]+)$/);
    if (detailMatch) {
      const encodedId = decodeURIComponent(detailMatch[1]);
      const identity = fromBase64Url(encodedId);
      if (!identity?.number || !identity?.date) {
        sendJson(res, 400, { error: "Invalid timesheet id" });
        return;
      }
      const refresh = shouldRefresh(url.searchParams.get("refresh"));
      const cacheKey = `detail:${encodedId}`;
      const { entry, hit } = await cachedInvoke(cacheKey, refresh, () =>
        enqueueOneC("detail", identity)
      );
      const item = entry?.value;
      if (!item) {
        sendJson(res, 404, { error: "Timesheet not found" });
        return;
      }
      sendJson(res, 200, {
        ...item,
        cache: {
          hit,
          source: entry?.source || null,
          updatedAt: entry?.updatedAt || null,
        },
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(`[onec-bridge] ${error?.stack || error}`);
    sendJson(res, 500, { error: error?.message || String(error) });
  }
});

loadCache();

server.listen(port, host, () => {
  console.log(`[onec-bridge] listening on http://${host}:${port}`);
  console.log(`[onec-bridge] persistent cache: ${cachePath}`);
  scheduleDailySync();

  const now = new Date();
  if (now.getHours() >= dailySyncHour && !sameLocalDate(syncState.lastDailySyncAt, now)) {
    runDailySync("startup").catch((error) => {
      console.error(`[onec-bridge] startup sync failed: ${error?.message || error}`);
    });
  }
});
