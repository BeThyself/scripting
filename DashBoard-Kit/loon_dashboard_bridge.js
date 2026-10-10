/**
 * Loon DashBoard-Kit 桌面交互小组件 本地 OpenAPI 桥接脚本
 * 用于响应 http://loon.lan/api 或 http://loon.local/api 请求
 *
 * 支持参数：
 * - action: "status" | "set_mode" | "set_policy"
 * - mode: "direct" | "filter" | "proxy" 或 0 | 1 | 2
 * - policy: 策略组名称 (例如 "节点选择")
 * - node: 目标节点名称 (例如 "🇭🇰 香港 01")
 */

function parseQuery(urlStr) {
  const query = {};
  const qIdx = urlStr.indexOf("?");
  if (qIdx >= 0) {
    const qStr = urlStr.slice(qIdx + 1);
    const pairs = qStr.split("&");
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair) continue;
      const eqIdx = pair.indexOf("=");
      if (eqIdx >= 0) {
        const k = decodeURIComponent(pair.slice(0, eqIdx));
        const v = decodeURIComponent(pair.slice(eqIdx + 1));
        query[k] = v;
      } else {
        query[decodeURIComponent(pair)] = "";
      }
    }
  }
  return query;
}

function getSubPoliciesAsync(policyName, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    let modeUsed = "callback";
    const finish = (list, note) => {
      if (done) return;
      done = true;
      resolve({ fired: true, list: list || [], ms: Date.now() - started, note: note || "", mode: modeUsed });
    };
    const timer = setTimeout(() => finish([], "timeout"), timeoutMs);
    try {
      if (typeof $config === "undefined" || typeof $config.getSubPolicies !== "function") {
        clearTimeout(timer);
        finish([], "api-missing");
        return;
      }
      // 回调形式
      const ret = $config.getSubPolicies(policyName, function (a, b) {
        if (Array.isArray(a)) { clearTimeout(timer); finish(a, ""); }
        else if (Array.isArray(b)) { clearTimeout(timer); finish(b, ""); }
        else { clearTimeout(timer); finish([], "callback-no-array: " + typeof a + "/" + typeof b); }
      });
      // Promise 形式（部分版本返回 Promise 而不是走回调）
      if (ret && typeof ret.then === "function") {
        modeUsed = "promise";
        ret
          .then((arr) => { clearTimeout(timer); finish(Array.isArray(arr) ? arr : [], ""); })
          .catch((e) => { clearTimeout(timer); finish([], "promise-err: " + e); });
      }
    } catch (e) {
      clearTimeout(timer);
      finish([], "throw: " + e);
    }
  });
}

/** 单独探查 getSelectedPolicy 的行为（同步 / Promise / 报错） */
function probeSelectedPolicy(name) {
  const out = { name: name, sync: null, thenable: false, err: "" };
  try {
    if (typeof $config === "undefined" || typeof $config.getSelectedPolicy !== "function") {
      out.err = "api-missing";
      return out;
    }
    const v = $config.getSelectedPolicy(name);
    if (v && typeof v.then === "function") {
      out.thenable = true;
    } else if (typeof v === "string") {
      out.sync = v;
    } else if (v && typeof v === "object") {
      out.sync = String(v.name || v.policy || v.selected || JSON.stringify(v));
    } else if (v === undefined) {
      out.sync = "(undefined)";
    } else {
      out.sync = String(v);
    }
  } catch (e) {
    out.err = String(e);
  }
  return out;
}

(async () => {
  try {
    const reqUrl = typeof $request !== "undefined" && $request.url ? $request.url : "";
    const query = parseQuery(reqUrl);
    const action = query.action || "status";
    const mode = query.mode || "";
    const policy = query.policy || "";
    const node = query.node || "";

    // 1. 设置运行模式 (0: 全局直连, 1: 分流模式, 2: 全局代理)
    if (action === "set_mode" && mode !== "") {
      let targetModel = -1;
      if (mode === "0" || mode === "direct" || mode === "all_direct") {
        targetModel = 0;
      } else if (mode === "1" || mode === "filter" || mode === "rule") {
        targetModel = 1;
      } else if (mode === "2" || mode === "proxy" || mode === "all_proxy") {
        targetModel = 2;
      }
      if (targetModel >= 0 && typeof $config !== "undefined" && typeof $config.setRunningModel === "function") {
        $config.setRunningModel(targetModel);
      }
    }

    // 2. 切换策略组选中的节点
    if (action === "set_policy" && policy && node) {
      if (typeof $config !== "undefined" && typeof $config.getConfig === "function") {
        // $config.getConfig(policyName, selectName): 设置策略组所选节点
        $config.getConfig(policy, node);
      }
    }

    // 3. 读取当前配置
    let configObj = {};
    if (typeof $config !== "undefined" && typeof $config.getConfig === "function") {
      try {
        const raw = $config.getConfig();
        if (typeof raw === "string") {
          configObj = JSON.parse(raw);
        } else if (raw && typeof raw === "object") {
          configObj = raw;
        }
      } catch (e) {
        configObj = {};
      }
    }

    const runningModelNum =
      typeof configObj.running_model === "number"
        ? configObj.running_model
        : 1;

    let runningModeStr = "filter";
    if (runningModelNum === 0) runningModeStr = "all_direct";
    else if (runningModelNum === 2) runningModeStr = "all_proxy";

    const policySelect = configObj.policy_select || {};
    const allPolicyGroups = Array.isArray(configObj.all_policy_groups)
      ? configObj.all_policy_groups
      : Object.keys(policySelect);

    // 3.5 补齐 policy_select —— Loon 的 getConfig() 只会返回一部分策略组，
    // 缺失的组用 $config.getSelectedPolicy(name) 逐个查回来
    const filledPolicySelect = {};
    const probeResults = {};
    const thenableGroups = [];
    try {
      if (typeof $config !== "undefined" && typeof $config.getSelectedPolicy === "function") {
        const fillTimeoutAt = Date.now() + 2500;
        for (let i = 0; i < allPolicyGroups.length && i < 40; i++) {
          const g = allPolicyGroups[i];
          if (!g || policySelect[g]) continue;
          if (Date.now() > fillTimeoutAt) break;
          try {
            const probe = probeSelectedPolicy(g);
            if (probe.sync && probe.sync !== "(undefined)") {
              policySelect[g] = probe.sync;
              filledPolicySelect[g] = probe.sync;
            } else if (probe.thenable) {
              thenableGroups.push(g);
            } else {
              probeResults[g] = probe;
            }
          } catch (e) {}
        }

        // 若为 Promise 形式，等它们回来
        if (thenableGroups.length > 0) {
          await Promise.all(
            thenableGroups.map(async (g) => {
              try {
                const v = await $config.getSelectedPolicy(g);
                let name = "";
                if (typeof v === "string") name = v;
                else if (v && typeof v === "object") name = v.name || v.policy || v.selected || "";
                if (name) {
                  policySelect[g] = String(name);
                  filledPolicySelect[g] = String(name);
                } else {
                  probeResults[g] = { name: g, sync: "(promise-empty)", thenable: true, err: "" };
                }
              } catch (e) {
                probeResults[g] = { name: g, sync: null, thenable: true, err: String(e) };
              }
            })
          );
        }
      } else if (typeof $config !== "undefined") {
        probeResults.__missing_api = { name: "getSelectedPolicy", sync: null, thenable: false, err: "api-missing" };
      }
    } catch (e) {}

    // 4. 获取策略组的候选子节点列表（并行，单个 2.5s 超时，并回传调试信息）
    const subTimeout = Number(query.sub_timeout) > 0 ? Number(query.sub_timeout) : 2500;
    const wantGroup = query.group || "";
    const targetGroups = wantGroup
      ? [wantGroup]
      : allPolicyGroups.slice(0, 8);
    const subPoliciesMap = {};
    const subDebug = {};

    await Promise.all(
      targetGroups.map(async (gName) => {
        const r = await getSubPoliciesAsync(gName, subTimeout);
        subDebug[gName] = { fired: r.fired, ms: r.ms, count: r.list.length, note: r.note || "" };
        if (r.list && r.list.length > 0) {
          subPoliciesMap[gName] = r.list.slice(0, 40);
        }
      })
    );

    const envInfo = typeof $environment !== "undefined" ? $environment : null;
    const versionStr =
      envInfo && envInfo.version
        ? `Loon ${envInfo.version}`
        : "Loon 3.2+";

    const responseData = {
      ok: true,
      service: "loon",
      running_model: runningModelNum,
      running_mode: runningModeStr,
      policy_select: policySelect,
      selected_policy_filled: filledPolicySelect,
      selected_policy_probe: probeResults,
      sub_policies: subPoliciesMap,
      sub_debug: subDebug,
      all_policy_groups: allPolicyGroups,
      ssid: configObj.ssid || "",
      final: configObj.final || "",
      global_proxy: configObj.global_proxy || "",
      version: versionStr,
      // ── 能力探查：把 Loon 实际暴露的 API / 字段列出来，便于对症下药 ──
      config_api_keys: (function () {
        try { return Object.keys($config || {}); } catch (e) { return []; }
      })(),
      environment: (function () {
        try { return typeof $environment !== "undefined" ? $environment : null; } catch (e) { return null; }
      })(),
      config_obj_keys: Object.keys(configObj || {}),
      timestamp: Date.now(),
    };

    $done({
      response: {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(responseData),
      },
    });
  } catch (err) {
    $done({
      response: {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: false, error: String(err) }),
      },
    });
  }
})();
