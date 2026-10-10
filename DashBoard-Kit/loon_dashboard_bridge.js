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

function getSubPoliciesAsync(policyName) {
  return new Promise((resolve) => {
    try {
      if (typeof $config !== "undefined" && typeof $config.getSubPolicies === "function") {
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve([]);
          }
        }, 600);

        $config.getSubPolicies(policyName, (subPolicies) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve(Array.isArray(subPolicies) ? subPolicies : []);
          }
        });
      } else {
        resolve([]);
      }
    } catch (e) {
      resolve([]);
    }
  });
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

    // 4. 获取主要策略组的候选子节点列表 (取前 6 个或指定的策略组)
    const targetGroups = allPolicyGroups.slice(0, 6);
    const subPoliciesMap = {};

    await Promise.all(
      targetGroups.map(async (gName) => {
        const subs = await getSubPoliciesAsync(gName);
        if (subs && subs.length > 0) {
          subPoliciesMap[gName] = subs;
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
      sub_policies: subPoliciesMap,
      all_policy_groups: allPolicyGroups,
      ssid: configObj.ssid || "",
      final: configObj.final || "",
      global_proxy: configObj.global_proxy || "",
      version: versionStr,
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
