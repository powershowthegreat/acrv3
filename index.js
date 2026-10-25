
import * as jelly from "@jellycade/script";

function sanitize(value, secret) {
  const seen = new WeakSet();

  const redact = text => String(text)
    .replaceAll(secret || "\u0000", "[REDACTED]")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");

  if (value === undefined) return null;

  const json = JSON.stringify(value, (key, entry) => {
    if (/token|cookie|secret|password|authorization|session|credential|api[_-]?key/i.test(key)) {
      return "[REDACTED]";
    }

    if (typeof entry === "string") return redact(entry);
    if (typeof entry === "bigint") return entry.toString();

    if (entry && typeof entry === "object") {
      if (seen.has(entry)) return "[Circular]";
      seen.add(entry);
    }

    return entry;
  });

  try {
    return json === undefined ? null : JSON.parse(json);
  } catch {
    return redact(json);
  }
}

function classify(response) {
  if (response?.payload === "{}") {
    return {
      ok: true,
      status: "success",
      message: "ACR bonus successfully claimed."
    };
  }

  if (response?.code === 13) {
    return {
      ok: false,
      status: "not_unlocked",
      message: response.message || "Bonus is not unlocked yet."
    };
  }

  return {
    ok: false,
    status: "api_error",
    message: response?.message || "Unexpected ACR API response."
  };
}

async function runJob(env, trigger = "manual") {
  const started = Date.now();
  let status = "failed";
  let message = "";
  let response = null;

  try {
    if (!env.JELLYCADE_TOKEN) {
      throw new Error("Missing JELLYCADE_TOKEN secret");
    }

    const client = new jelly.Client(env.JELLYCADE_TOKEN);

    // Refresh silently.
    await client.refresh();

    const rbr = new jelly.RBRClient("inherit", client);
    const acrResponse = await rbr.acr();

    const result = classify(acrResponse);

    status = result.status;
    message = result.message;
    response = sanitize(acrResponse, env.JELLYCADE_TOKEN);

  } catch (error) {
    status = "failed";
    message = sanitize(
      error?.message || "Unknown execution error",
      env.JELLYCADE_TOKEN
    );

    response = sanitize({
      name: error?.name || "Error",
      message,
      apiResponse: error?.response || error?.data || null
    }, env.JELLYCADE_TOKEN);
  }

  const durationMs = Date.now() - started;

  const label = status === "success"
    ? "SUCCESS"
    : status === "not_unlocked"
      ? "NOT UNLOCKED"
      : "ERROR";

  const logs = [
    `[ACR] ${label}: ${message}`,
    `[ACR] Trigger: ${trigger}`,
    `[ACR] Duration: ${durationMs}ms`,
    `[ACR] Response: ${JSON.stringify(response)}`
  ];

  if (status === "success") {
    logs.forEach(line => console.log(line));
  } else if (status === "not_unlocked") {
    logs.forEach(line => console.warn(line));
  } else {
    logs.forEach(line => console.error(line));
  }

  return {
    ok: status === "success",
    status,
    logs
  };
}

function page(result) {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>acrv3 logs</title>
<style>
body {
  font: 14px ui-monospace, Consolas, monospace;
  max-width: 900px;
  margin: 40px auto;
  padding: 0 20px;
}
pre {
  background: #111827;
  color: #e5e7eb;
  padding: 20px;
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
</style>
</head>
<body>
<h2>acrv3 execution logs</h2>
<pre>${result.logs.map(escapeHtml).join("\n")}</pre>
</body>
</html>`,
    {
      status: result.ok ? 200 : result.status === "not_unlocked" ? 409 : 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

export default {
  async scheduled(controller, env) {
    const minute = Math.floor(controller.scheduledTime / 60_000);

    // Execute once every 32 minutes.
    if (minute % 32 !== 0) return;

    await runJob(env, "scheduled");
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/run") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET" }
      });
    }

    return page(await runJob(env, "manual"));
  }
};
