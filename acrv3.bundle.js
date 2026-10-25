// node_modules/@jellycade/script/request.js
async function request(method = "GET", base = "nakama", uri = "", options = {}, doublestringify = base == "nakama" && uri.includes("rpc")) {
  base = {
    "jelly": "https://jellycade.com",
    "nakama": "https://dev-nakama.winterpixel.io"
  }[base] || base;
  base += base.at(-1) == "/" ? "" : "/";
  uri = uri.at(0) == "/" ? uri.slice(1) : uri;
  if (!["POST", "OPTIONS", "DELETE", "PUT", "PATCH"].includes(method.toUpperCase()) && options.body) {
    console.warn(`Warning: jelly-request ${method} ${base + uri}, body was provided but not used due to incompatable method`);
  }
  let req = await fetch(base + uri, {
    "headers": options.headers || {},
    "method": method,
    "body": ["POST", "OPTIONS", "DELETE", "PUT", "PATCH"].includes(method.toUpperCase()) ? doublestringify ? JSON.stringify(JSON.stringify(options.body || {})) : JSON.stringify(options.body || {}) : null
  });
  let res = await req.json();
  return res;
}

// node_modules/@jellycade/script/jelly.js
var Client = class {
  constructor(token) {
    this.jellytoken = token;
  }
  async refresh() {
    return request("GET", "jelly", "api/auth/get-session?disableCookieCache=true", {
      headers: {
        "cookie": `__Host-portal.session_token=${this.jellytoken};`,
        "Referer": "https://jellycade.com/en/account"
      }
    });
  }
  async getPlayerCounts() {
    return request("GET", "jelly", "api/player-counts", {
      headers: {
        "accept": "application.json",
        "Referer": "https://jellycade.com/en/games/rocket-bot-royale"
      }
    });
  }
};

// node_modules/@jellycade/script/config.js
var config = {
  client_version: "99999",
  platform: "jellycade",
  id: "jellycade_1"
};
var config_default = config;

// node_modules/@jellycade/script/rbr.js
var RBRClient = class {
  constructor(from = "inherit", token) {
    this.authed = this.auth(from, token);
    return new Proxy(this, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function" || prop === "auth") return value;
        return async (...args) => {
          await target.authed;
          return value.apply(target, args);
        };
      }
    });
  }
  async auth(from = "inherit", token) {
    if (from == "inherit" || from == "jellytoken") {
      let res1 = await request("GET", "jelly", "api/token", {
        headers: {
          "cookie": `__Host-portal.session_token=${from == "inherit" ? token.jellytoken : token};`,
          "Referer": "https://jellycade.com/en/games/rocket-bot-royale"
        }
      });
      let res2 = await request("POST", "nakama", "v2/account/authenticate/device?create=true", {
        headers: {
          "authorization": "Basic OTAyaXViZGFmOWgyZTlocXBldzBmYjlhZWIzOTo=",
          "Referer": "https://rocketbotroyale.winterpixel.io/"
        },
        body: {
          id: config_default.id,
          vars: {
            client_version: config_default.client_version,
            platform: config_default.platform,
            jellycade_token: res1.token
          }
        }
      });
      this.rbrtoken = res2.token;
      return res2.token;
    } else if (from == "rbrtoken") {
      this.rbrtoken = token;
      return token;
    } else if (from == "newguest") {
      let res = await request("POST", "nakama", "v2/account/authenticate/custom?create=true&", {
        headers: {
          accept: "application/json",
          authorization: "Basic OTAyaXViZGFmOWgyZTlocXBldzBmYjlhZWIzOTo="
        },
        body: {
          id: config_default.id,
          vars: {
            client_version: config_default.client_version,
            platform: config_default.platform
          }
        }
      });
      this.rbrtoken = res.token;
      return res.token;
    } else {
      throw new Error("Invalid auth type");
    }
  }
  async acr() {
    return request("POST", "nakama", "v2/rpc/collect_timed_bonus", {
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${this.rbrtoken}`,
        "Referer": "https://rocketbotroyale.winterpixel.io/"
      }
    });
  }
  async RPCLeaderboard(leaderboard, season, limit, cursor) {
    let res = await request("POST", "nakama", "v2/rpc/query_leaderboard", {
      headers: {
        "authorization": `Bearer ${this.rbrtoken}`,
        "accept": "application/json",
        "Referer": "https://rocketbotroyale.winterpixel.io/"
      },
      body: {
        leaderboard,
        season,
        limit,
        cursor
      }
    }, true);
    return JSON.parse(res.payload);
  }
  // async getleaderboards(leaderboards, season){
  //     let res = await request("POST", "nakama", "v2/rpc/query_multiple_leaderboards", {
  //         headers:{
  //             "authorization":`Bearer ${this.rbrtoken}`,
  //             "accept": "application/json",
  //             "Referer": "https://rocketbotroyale.winterpixel.io/"
  //         },
  //         body:{
  //             leaderboards, 
  //             season
  //         }
  //     }, true)
  //     return JSON.parse(res.payload)
  // }
  async getLeaderboard(leaderboard, season, query, options) {
    if (query == "range") {
      if (!options.from || !options.to) throw new Error("Leaderboard range query requires from and to");
      let cursor = (await this.RPCLeaderboard(leaderboard, season, options.from - 1)).next_cursor;
      let res = await this.RPCLeaderboard(leaderboard, season, options.to - options.from, cursor);
      return res.records;
    } else if (query == "self") {
      if (!options.limit) throw new Error("Leaderboard self query requires limit");
      let res = await request("POST", "nakama", "v2/rpc/query_leaderboard_around_user", {
        headers: {
          "accept": "application/json",
          "Referer": "https://rocketbotroyale.winterpixel.io/",
          "authorization": `Bearer ${this.rbrtoken}`
        },
        body: {
          leaderboard,
          season,
          limit: options.limit
        }
      }, true);
      return JSON.parse(res.payload).records;
    } else {
      throw new Error("Leaderboard requires valid query type");
    }
  }
  async getLeaderboardRanks(leaderboard, season, players) {
    if (!Array.isArray(players)) players = [players];
    let res = await request("POST", "nakama", "v2/rpc/query_leaderboard", {
      headers: {
        "accept": "application/json",
        "Referer": "https://rocketbotroyale.winterpixel.io/",
        "authorization": `Bearer ${this.rbrtoken}`
      },
      body: {
        leaderboard,
        season,
        limit: 0,
        "owner_ids": players
      }
    });
    return JSON.parse(res.payload).owner_records;
  }
  async friend(action, player) {
    if (!["delete", "deny", "send", "accept"].includes(action)) throw new Error("Invalid action");
    return request(action == "delete" || action == "deny" ? "DELETE" : action == "accept" || action == "send" ? "POST" : "", "nakama", `v2/friend?ids=${player}`, {
      headers: {
        "accept": "application/json",
        "Referer": "https://rocketbotroyale.winterpixel.io/",
        "authorization": `Bearer ${this.rbrtoken}`
      }
    });
  }
  async getProfiles(players) {
    if (!Array.isArray(players)) players = [players];
    let res = await request("POST", "nakama", "v2/rpc/rpc_get_users_with_profile", {
      headers: {
        "accept": "application/json",
        "Referer": "https://rocketbotroyale.winterpixel.io/",
        "authorization": `Bearer ${this.rbrtoken}`
      },
      body: {
        ids: players
      }
    });
    return JSON.parse(res.payload);
  }
};

// index.js
function sanitize(value, secret) {
  const seen = /* @__PURE__ */ new WeakSet();
  const redact = (text) => String(text).replaceAll(secret || "\0", "[REDACTED]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  if (value === void 0) return null;
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
    return json === void 0 ? null : JSON.parse(json);
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
    const client = new Client(env.JELLYCADE_TOKEN);
    await client.refresh();
    const rbr = new RBRClient("inherit", client);
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
  const label = status === "success" ? "SUCCESS" : status === "not_unlocked" ? "NOT UNLOCKED" : "ERROR";
  const logs = [
    `[ACR] ${label}: ${message}`,
    `[ACR] Trigger: ${trigger}`,
    `[ACR] Duration: ${durationMs}ms`,
    `[ACR] Response: ${JSON.stringify(response)}`
  ];
  if (status === "success") {
    logs.forEach((line) => console.log(line));
  } else if (status === "not_unlocked") {
    logs.forEach((line) => console.warn(line));
  } else {
    logs.forEach((line) => console.error(line));
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
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
var index_default = {
  async scheduled(controller, env) {
    const minute = Math.floor(controller.scheduledTime / 6e4);
    if (minute % 32 !== 0) return;
    await runJob(env, "scheduled");
  },
  async fetch(request2, env) {
    const url = new URL(request2.url);
    if (url.pathname !== "/run") {
      return new Response("Not found", { status: 404 });
    }
    if (request2.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET" }
      });
    }
    return page(await runJob(env, "manual"));
  }
};
export {
  index_default as default
};
