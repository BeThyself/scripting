/**
 * 匹配引擎：把「扫到的内容」解析成「该打开哪个 App 的哪个 scheme」。
 *
 * 规则数据来自 https://sumqt.com 自定义方案中心（见 rules.ts），共 4600+ 条。
 *
 * sumqt 的规则语义（逆向自其数据）：
 *   - type 1：link 命中即可。link 可以用 `|` 分隔多个片段，
 *     片段里带正则元字符（^ $ * + ? [ ] ( ) { }）时按正则处理，否则按域名/文本处理。
 *   - type 2：link 与 regex **同时**命中才算数。
 *     （例：link=api36294.tmwanba.com, regex=.*https.* —— 只靠 regex 会命中所有 https 链接，
 *       必须两个条件一起用。）
 *
 * 匹配优先级：
 *   0. 内容本身就是一个 scheme（如 weixin://wxpay/...）→ 直接打开
 *   1. 内置核心规则（微信支付 / 支付宝收银台 / 银联）
 *   2. 规则库（按分类权重 + 匹配精度打分）
 *   3. 回退（浏览器打开 / 交回默认 App 的扫一扫）
 */

import { DB, type RuleRow } from "./rules"
import type { AggregatePayApp } from "./store"

export type RuleSource = "scheme" | "core" | "domain" | "aggregate" | "db" | "fallback"

export interface ScanMatch {
  /** 扫描到的原始内容 */
  raw: string
  /** 最终要打开的 URL */
  target: string
  /** 目标 App 名称 */
  app: string
  /** 目标 App 的 SF Symbol */
  icon: string
  /** 命中的规则名 */
  title: string
  /** 分类 */
  category: string
  /** 命中的域名 / 正则 */
  matched: string
  /** 来源 */
  source: RuleSource
  /** 打分，仅用于排序 */
  score: number
}

/* ------------------------------------------------------------------ */
/* App 元数据                                                          */
/* ------------------------------------------------------------------ */

export interface AppInfo {
  name: string
  icon: string
}

const SCHEME_APP: [RegExp, AppInfo][] = [
  [/^(weixin|wxp):/i, { name: "微信", icon: "message.fill" }],
  [/^wxwork:/i, { name: "企业微信", icon: "building.2.fill" }],
  [/^alipay(s|qr)?:/i, { name: "支付宝", icon: "a.circle.fill" }],
  [/^mqqapi:|^mqq:/i, { name: "QQ", icon: "bubble.left.and.bubble.right.fill" }],
  [/^upwallet:/i, { name: "云闪付", icon: "creditcard.fill" }],
  [/^snssdk1128:/i, { name: "抖音", icon: "music.note.tv.fill" }],
  [/^snssdk2329:/i, { name: "抖音极速版", icon: "music.note.tv.fill" }],
  [/^imeituan:/i, { name: "美团", icon: "takeoutbag.and.cup.and.straw.fill" }],
  [/^taobao:/i, { name: "淘宝", icon: "bag.fill" }],
  [/^dingtalk/i, { name: "钉钉", icon: "checkmark.seal.fill" }],
  [/^feishu:/i, { name: "飞书", icon: "paperplane.fill" }],
  [/^quark:/i, { name: "夸克", icon: "magnifyingglass.circle.fill" }],
  [/^xhsdiscover:/i, { name: "小红书", icon: "book.fill" }],
  [/^openapp\.jdmobile:/i, { name: "京东", icon: "cart.fill" }],
  [/^baiduboxapp:/i, { name: "百度", icon: "pawprint.fill" }],
  [/^iosamap:/i, { name: "高德地图", icon: "map.fill" }],
  [/^bilibili:/i, { name: "哔哩哔哩", icon: "play.rectangle.fill" }],
  [/^kwai:/i, { name: "快手", icon: "video.fill" }],
  [/^damai:/i, { name: "大麦", icon: "ticket.fill" }],
  [/^hellobike:/i, { name: "哈啰", icon: "bicycle" }],
  [/^videocut:/i, { name: "剪映", icon: "scissors" }],
  [/^iqiyi:/i, { name: "爱奇艺", icon: "play.tv.fill" }],
  [/^cnbusiness:/i, { name: "交通银行", icon: "building.columns.fill" }],
  [/^chaoxingshareback:/i, { name: "学习通", icon: "graduationcap.fill" }],
  [/^dtxuexi:/i, { name: "学习强国", icon: "flag.fill" }],
  [/^lekefitness:/i, { name: "乐刻运动", icon: "figure.run" }],
  [/^orpheus/i, { name: "网易云音乐", icon: "music.note" }],
  [/^qqmusic:/i, { name: "QQ音乐", icon: "music.note.list" }],
  [/^zhihu:/i, { name: "知乎", icon: "questionmark.circle.fill" }],
  [/^sinaweibo:|^weibolite:|^weibointernational:/i, { name: "微博", icon: "at.circle.fill" }],
  [/^eleme:/i, { name: "饿了么", icon: "takeoutbag.and.cup.and.straw.fill" }],
  [/^wbmain:/i, { name: "58同城", icon: "building.2.fill" }],
  [/^https?:/i, { name: "浏览器", icon: "safari.fill" }],
]

export function appInfoOf(scheme: string): AppInfo {
  for (const [re, info] of SCHEME_APP) {
    if (re.test(scheme)) return info
  }
  return { name: "其他 App", icon: "app.fill" }
}

/** 分类权重：支付、登录优先，其余靠后 */
const CAT_SCORE: Record<string, number> = {
  收款支付: 1000,
  登录验证: 900,
  餐饮点餐: 420,
  购物电商: 420,
  停车出行: 420,
  充电: 420,
  物流快递: 420,
  政务医疗: 420,
  查询防伪: 420,
  影音娱乐: 420,
  AI工具: 420,
  App下载: 400,
  链接跳转: 320,
  其他: 100,
}

/** 供 UI 展示的「重点分类」 */
export const PRIORITY_CATEGORIES = ["收款支付", "登录验证"]

/**
 * 这些 scheme 微信/其他 App 没有向外部开放，iOS 直接 open 会失败（实测）：
 *   wxp://  微信收款码       -> false
 *   mmpay:// 微信支付内部     -> false
 * 遇到这类内容不能推荐「直连」，必须交给对应 App 自己的扫一扫。
 */
const NO_DIRECT_OPEN = new Set(["wxp", "mmpay", "weixinapp", "wxworkapp"])

export function canDirectOpen(scheme: string): boolean {
  if (!scheme) return false
  if (scheme === "http" || scheme === "https") return true
  return !NO_DIRECT_OPEN.has(scheme)
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

const SCHEME_RE = /^([a-z][a-z0-9+.\-]*):/i

/** 取出内容的 scheme（小写）；不是 scheme 则返回 "" */
export function schemeOf(content: string): string {
  const m = SCHEME_RE.exec(content.trim())
  return m ? m[1].toLowerCase() : ""
}

/** 取出主机名；取不到返回 "" */
export function hostOf(content: string): string {
  const c = content.trim()
  const m = /^[a-z][a-z0-9+.\-]*:\/\/([^/?#]+)/i.exec(c)
  if (m) {
    return m[1].toLowerCase().replace(/^[^@]*@/, "").split(":")[0]
  }
  const m2 = /^([a-z0-9\-]+(?:\.[a-z0-9\-]+)+)(?:[/?#]|$)/i.exec(c)
  return m2 ? m2[1].toLowerCase() : ""
}

/** 是否 http(s) 链接 */
export function isHttpUrl(content: string): boolean {
  return /^https?:\/\//i.test(content.trim())
}

/**
 * 把规则里的目标 scheme 模板实例化成真实 URL。
 * `¥` 是占位符，代表扫到的内容。
 */
export function buildTarget(template: string, content: string): string {
  if (!template) return ""
  if (template === "¥") return content
  if (!template.includes("¥")) return template
  // 形如 quark://¥、cnbusiness://¥ —— 整段就是内容，不编码
  if (/:\/\/¥$/.test(template)) return template.slice(0, -1) + content
  // 其余（放在 query 里）需要编码
  return template.replace("¥", encodeURIComponent(content))
}

/* ------------------------------------------------------------------ */
/* 内置核心规则                                                        */
/* ------------------------------------------------------------------ */

interface CoreRule {
  test: (content: string, host: string) => boolean
  title: string
  category: string
  app: AppInfo
  build: (content: string) => string
  /** 可选：覆盖默认优先级（默认 50000） */
  score?: number
}

const ALIPAY_QR = (c: string) =>
  `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(c)}`

const CORE_RULES: CoreRule[] = [
  {
    // 支付宝收款码 / 商户码：直接把 URL 交给支付宝收银台，省掉二次扫码
    test: (_c, h) => h === "qr.alipay.com" || h.endsWith(".qr.alipay.com"),
    title: "支付宝收款码（直达收银台）",
    category: "收款支付",
    app: { name: "支付宝", icon: "a.circle.fill" },
    build: ALIPAY_QR,
  },
  {
    test: (_c, h) => h === "qr.alipayplus.com" || h.endsWith(".alipayplus.com"),
    title: "Alipay+ 收款码",
    category: "收款支付",
    app: { name: "支付宝", icon: "a.circle.fill" },
    build: ALIPAY_QR,
  },
  {
    // u.alipay.cn 是支付宝的短链收款码
    test: (_c, h) => h === "u.alipay.cn" || h.endsWith(".alipay.cn"),
    title: "支付宝短链收款码",
    category: "收款支付",
    app: { name: "支付宝", icon: "a.circle.fill" },
    build: ALIPAY_QR,
  },
  {
    // 公众号文章：直接用浏览器阅读最稳妥（与 sumqt 里 us=¥ 的意图一致）
    test: (_c, h) => h === "mp.weixin.qq.com",
    title: "微信公众号文章",
    category: "链接跳转",
    app: { name: "浏览器", icon: "safari.fill" },
    build: (c) => c,
  },
  {
    // 微信支付域名：交回微信扫一扫
    test: (_c, h) => h === "tenpay.com" || h.endsWith(".tenpay.com"),
    title: "微信支付（交回微信扫一扫）",
    category: "收款支付",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://scanqrcode",
  },
  {
    // 银联云闪付收款码
    test: (_c, h) => h === "95516.com" || h.endsWith(".95516.com"),
    title: "银联收款码",
    category: "收款支付",
    app: { name: "云闪付", icon: "creditcard.fill" },
    build: () => "upwallet://native/scanCode",
  },
  {
    // 微信收款码：wxp:// 微信没有对外开放，外部 App 打不开，只能交给微信扫一扫
    test: (c) => /^wxp:\/\//i.test(c),
    title: "微信收款码（交回微信扫一扫）",
    category: "收款支付",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://scanqrcode",
  },
  {
    // 备用入口：同样能打开微信扫一扫，某些版本下体验不同
    test: (c) => /^wxp:\/\//i.test(c),
    title: "微信收款码（备用入口）",
    category: "收款支付",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://widget/scan",
    score: 49000,
  },
  {
    // mmpay:// 同为微信内部协议，未对外开放
    test: (c) => /^mmpay:/i.test(c),
    title: "微信支付内部协议（交回微信扫一扫）",
    category: "收款支付",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://scanqrcode",
  },
  {
    // 微信号 / 个人名片二维码：u.wechat.com 在浏览器里只会提示「请在微信中打开」
    test: (_c, h) => h === "u.wechat.com" || h.endsWith(".u.wechat.com"),
    title: "微信号二维码（交回微信扫一扫）",
    category: "登录验证",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://scanqrcode",
  },
  {
    // 旧版个人名片短链 weixin.qq.com/r/xxxxx
    test: (c, h) => h === "weixin.qq.com" && /^https?:\/\/weixin\.qq\.com\/r\//i.test(c),
    title: "微信号二维码（旧版短链）",
    category: "登录验证",
    app: { name: "微信", icon: "message.fill" },
    build: () => "weixin://scanqrcode",
  },
]

/**
 * QQ 扫一扫。
 *
 * 规则库里写的是 `mqqapi://qrcode/scan_qrcode?version=1`，**少了 `&src_type=app`**，
 * 结果只会把 QQ 拉到主界面而不是扫一扫（实测）。腾讯官方文档和社区整理的写法都带这一段。
 */
export const QQ_SCAN_SCHEME = "mqqapi://qrcode/scan_qrcode?version=1&src_type=app"

/**
 * 修正规则库里残缺的目标 scheme。
 * 规则库是第三方抓来的，个别 scheme 少了必要参数，照抄会「App 打开了但没到目标页面」。
 */
function normalizeTarget(t: string): string {
  // mqqapi / timapi / tim 的扫一扫：补上 src_type=app
  if (/^(mqqapi|timapi|tim):\/\/qrcode\/scan_qrcode\?/i.test(t) && !/src_type=/i.test(t)) {
    return t + "&src_type=app"
  }
  return t
}

/* ------------------------------------------------------------------ */
/* 域名 → App 直达（补齐 sumqt 缺失的 App）                             */
/* ------------------------------------------------------------------ */

/**
 * sumqt 规则库只收录了 40 个目标 App 的 scheme，很多 App 根本没收录，
 * 导致它们的规则只能写成 `us=¥`（= 原样打开），扫登录码等于白扫（跳浏览器）。
 * 这里手工补齐一批常用 App：
 *   - 有「扫一扫」直达入口的（scan: true）优先用扫一扫；
 *   - 没有公开扫一扫入口的，只能打开 App 首页，用户再手动扫（scan: false）。
 *
 * 只在「内容看起来是登录码」且域名命中时才生效，避免把普通分享链接
 * （比如知乎回答页）也顶去扫一扫。想加 App 在表里加一行即可。
 */
interface DomainApp {
  hosts: string[]
  app: AppInfo
  scheme: string
  title: string
  /** true = 直达扫一扫；false = 只打开 App 首页 */
  scan: boolean
  /**
   * true = 只在内容像登录码时才用。
   * 必须开——否则普通分享链接（知乎回答页之类）也会被顶去扫一扫。
   * 腾讯系域名例外：那些域名上的东西本来就该交给 QQ 扫。
   */
  onlyForLogin: boolean
}

const DOMAIN_APP: DomainApp[] = [
  {
    hosts: ["music.163.com", "163cn.tv"],
    app: { name: "网易云音乐", icon: "music.note" },
    scheme: "orpheus://",
    title: "网易云音乐（打开 App）",
    scan: false,
    onlyForLogin: false,
  },
  {
    hosts: ["y.qq.com"],
    app: { name: "QQ音乐", icon: "music.note.list" },
    scheme: "qqmusic://",
    title: "QQ音乐（打开 App）",
    scan: false,
    onlyForLogin: false,
  },
  {
    hosts: ["zhihu.com"],
    app: { name: "知乎", icon: "questionmark.circle.fill" },
    scheme: "zhihu://codereader",
    title: "知乎扫一扫",
    scan: true,
    onlyForLogin: true,
  },
  {
    hosts: ["weibo.com", "m.weibo.cn"],
    app: { name: "微博", icon: "at.circle.fill" },
    scheme: "sinaweibo://qrcode",
    title: "微博扫一扫",
    scan: true,
    onlyForLogin: true,
  },
  {
    hosts: ["ele.me"],
    app: { name: "饿了么", icon: "takeoutbag.and.cup.and.straw.fill" },
    scheme: "eleme://code_scanner",
    title: "饿了么扫一扫",
    scan: true,
    onlyForLogin: true,
  },
  {
    hosts: ["kuaishou.com"],
    app: { name: "快手", icon: "video.fill" },
    scheme: "kwai://qrscan",
    title: "快手扫一扫",
    scan: true,
    onlyForLogin: true,
  },
  {
    hosts: ["58.com"],
    app: { name: "58同城", icon: "building.2.fill" },
    scheme: "wbmain://jump/core/capture",
    title: "58同城扫一扫",
    scan: true,
    onlyForLogin: true,
  },
  {
    // QQ 登录码的内容是 https://ssl.ptlogin2.qq.com/ptqrlogin?...
    // sumqt 规则库里完全没有 ptlogin2，所以只能在这里补。
    hosts: [
      "ptlogin.qq.com",
      "ptlogin2.qq.com",
      "ptlogin4.qq.com",
      "graph.qq.com",
      "q.qq.com",
      "accounts.qq.com",
      "aq.qq.com",
      "id.qq.com",
      "qun.qq.com",
      "w.qq.com",
      "web.qq.com",
      "web2.qq.com",
      // 腾讯推广短链。规则库里有三条打架的规则（腾讯礼包领取→微信 420 分
      // 比 QQ官方推广→mqqapi 320 分高），所以必须在这里抢回来。
      "txz.qq.com",
      "qm.qq.com",
    ],
    app: { name: "QQ", icon: "bubble.left.and.bubble.right.fill" },
    scheme: QQ_SCAN_SCHEME,
    title: "QQ扫一扫",
    scan: true,
    onlyForLogin: false,
  },
]

function matchDomainApp(host: string): DomainApp | null {
  if (!host) return null
  for (const d of DOMAIN_APP) {
    for (const h of d.hosts) {
      if (host === h || host.endsWith("." + h)) return d
    }
  }
  return null
}

/** 内容看起来像「登录/扫码确认」类链接 */
const LOGIN_HINTS = /(login|qrlogin|qrcode|codekey|scan|sso|oauth|passport|authorize|verify)/i

/**
 * 最后一道兜底：内容根本不是网址（比如二维码里是一串内部 token），
 * 没有域名可判断，只能从文本里找 App 关键字猜一下。
 * 猜错也不至于坑人——它只排在「默认 App 扫一扫」前面，用户还能选别的。
 */
const CONTENT_HINTS: { re: RegExp; scheme: string; app: AppInfo; title: string }[] = [
  {
    re: /ptlogin|qrsig|ptqrtoken|qzone|tencent|qun\.qq|mqqapi|qq\.com/i,
    scheme: QQ_SCAN_SCHEME,
    app: { name: "QQ", icon: "bubble.left.and.bubble.right.fill" },
    title: "QQ扫一扫（按内容推断）",
  },
  {
    re: /alipay|alipays/i,
    scheme: "alipays://platformapi/startapp?saId=10000007",
    app: { name: "支付宝", icon: "a.circle.fill" },
    title: "支付宝扫一扫（按内容推断）",
  },
  {
    re: /weixin|wechat/i,
    scheme: "weixin://scanqrcode",
    app: { name: "微信", icon: "message.fill" },
    title: "微信扫一扫（按内容推断）",
  },
]

function matchContentHint(c: string) {
  for (const h of CONTENT_HINTS) {
    if (h.re.test(c)) return h
  }
  return null
}

/**
 * 腾讯系域名（排除微信系）。
 *
 * 规则库作者在腾讯域名上很爱选「微信扫一扫」，导致 QQ 目标被顶掉：
 *   txz.qq.com            腾讯礼包领取(影音娱乐 420) → 微信  >  QQ官方推广(链接跳转 320) → mqqapi
 *   a.app.qq.com          腾讯云COS → 微信                vs  应用宝下载 → mqqapi
 *   pinyin.sginput.qq.com 搜狗输入法 → 微信                vs  QQ输入法授权 → mqqapi
 * 于是扫 QQ 登录码会跑到微信去。
 */
function isTencentHost(host: string): boolean {
  if (!host) return false
  if (!/(^|\.)qq\.com$/i.test(host)) return false
  if (/weixin|wechat/i.test(host)) return false // weixin.qq.com / *.weixin.qq.com
  if (/^wx\./i.test(host)) return false // wx.mail.qq.com
  if (host === "we.qq.com") return false // 微信二维码
  return true
}

/* ------------------------------------------------------------------ */
/* 规则库编译                                                          */
/* ------------------------------------------------------------------ */

const META_CHARS = /[\^$*+?\[\](){}]/
const DOMAINISH = /^[a-z0-9\-]+(?:\.[a-z0-9\-]+)+$/i
const FRAGMENT = /[/:?=&#]/

interface Part {
  re: RegExp | null
  text: string
}

interface Compiled {
  us: string
  type: number
  link: string
  regex: RegExp | null
  cat: string
  title: string
  parts: Part[]
}

let COMPILED: Compiled[] | null = null

function compileParts(link: string): Part[] {
  const out: Part[] = []
  for (const raw of link.split("|")) {
    const p = raw.trim()
    if (!p) continue
    if (META_CHARS.test(p)) {
      try {
        out.push({ re: new RegExp(p, "i"), text: "" })
      } catch {
        out.push({ re: null, text: p })
      }
    } else {
      out.push({ re: null, text: p })
    }
  }
  return out
}

function compiled(): Compiled[] {
  if (COMPILED) return COMPILED
  const list: Compiled[] = []
  for (const row of DB.r as RuleRow[]) {
    const [usIdx, type, link, reStr, catIdx, title] = row
    const us = normalizeTarget(DB.u[usIdx])
    if (!us) continue // 没有目标 scheme 的规则无法执行
    let regex: RegExp | null = null
    if (reStr) {
      try {
        regex = new RegExp(reStr, "i")
      } catch {
        regex = null
      }
    }
    list.push({
      us,
      type,
      link,
      regex,
      cat: DB.c[catIdx],
      title,
      parts: compileParts(link),
    })
  }
  COMPILED = list
  return list
}

export function ruleCount(): number {
  return compiled().length
}

/** link 命中程度：返回 null 表示不命中，数值越大越精确 */
function matchLink(
  parts: Part[],
  raw: string,
  lower: string,
  host: string,
  isUrl: boolean,
): { q: number; m: string } | null {
  let best: { q: number; m: string } | null = null
  const consider = (q: number, m: string) => {
    if (q > 0 && (!best || q > best.q)) best = { q, m }
  }

  for (const p of parts) {
    if (p.re) {
      if (p.re.test(raw)) consider(25, p.re.source)
      continue
    }
    const t = p.text
    if (!t) continue

    if (DOMAINISH.test(t)) {
      if (host && (host === t || host.endsWith("." + t))) {
        consider(host === t ? 80 : 60, t)
      } else if (!isUrl && lower.includes(t)) {
        consider(30, t)
      }
    } else if (FRAGMENT.test(t)) {
      if (lower.includes(t)) consider(40, t)
    } else {
      // 纯词 / 中文短语：只在内容不是 http 链接时才用，避免 "app"、"item" 这类词误伤
      if (!isUrl && raw.includes(t)) consider(12, t)
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* 聚合收款码                                                          */
/* ------------------------------------------------------------------ */

/** 从规则的 link 里抽出主机名（非纯域名的直接返回空） */
function hostOfLink(link: string): string {
  const l = (link || "").trim().toLowerCase().replace(/^https?:\/\//, "")
  if (!l || /[|^$*+?\[\](){}]/.test(l)) return ""
  return l.split("/")[0].split("?")[0]
}

/**
 * 自动识别「聚合收款码」域名。
 *
 * 聚合收款码 = 一张码微信、支付宝都能付（收钱吧 / 银盛 / 拉卡拉 / 利楚扫呗 /
 * 乐刷 / 富友 / 易宝 / 通联 / 银联商务 / 各行收款码 …）。
 *
 * 判据：规则库里「收款支付」分类下，同一个域名**同时**存在微信目标和支付宝目标。
 * 不写死名单，规则库更新后自动跟着变。实测命中 69 个域名。
 */
let AGGREGATE_HOSTS: Set<string> | null = null

function aggregateHosts(): Set<string> {
  if (AGGREGATE_HOSTS) return AGGREGATE_HOSTS
  const m = new Map<string, { wx: boolean; ali: boolean }>()
  for (const r of compiled()) {
    if (r.cat !== "收款支付") continue
    const h = hostOfLink(r.link)
    if (!h || !h.includes(".")) continue
    const e = m.get(h) ?? { wx: false, ali: false }
    if (/^weixin:/i.test(r.us)) e.wx = true
    else if (/^alipay/i.test(r.us)) e.ali = true
    m.set(h, e)
  }
  const s = new Set<string>()
  for (const [h, e] of m) if (e.wx && e.ali) s.add(h)
  AGGREGATE_HOSTS = s
  return s
}

/** 域名（含子域）是否是聚合收款码 */
export function isAggregatePayHost(host: string): boolean {
  if (!host) return false
  const s = aggregateHosts()
  if (s.has(host)) return true
  for (const h of s) if (host.endsWith("." + h)) return true
  return false
}

/** 聚合收款码可选的目标 App */
export const AGGREGATE_PAY_TARGET: Record<
  Exclude<AggregatePayApp, "自动">,
  { scheme: string; app: AppInfo }
> = {
  微信: { scheme: "weixin://scanqrcode", app: { name: "微信", icon: "message.fill" } },
  支付宝: {
    scheme: "alipays://platformapi/startapp?saId=10000007",
    app: { name: "支付宝", icon: "a.circle.fill" },
  },
  云闪付: { scheme: "upwallet://native/scanCode", app: { name: "云闪付", icon: "creditcard.fill" } },
}

/* ------------------------------------------------------------------ */
/* 主匹配流程                                                          */
/* ------------------------------------------------------------------ */

interface Candidate extends ScanMatch {
  sort: number
}

function pushCandidate(
  out: Candidate[],
  raw: string,
  template: string,
  app: AppInfo,
  title: string,
  category: string,
  matched: string,
  source: RuleSource,
  score: number,
) {
  const target = buildTarget(template, raw)
  if (!target) return
  out.push({
    raw,
    target,
    app: app.name,
    icon: app.icon,
    title,
    category,
    matched,
    source,
    score,
    sort: score,
  })
}

/**
 * 解析扫描内容，返回按推荐度排序的候选跳转方案。
 *
 * @param preferApp    无匹配时优先交给哪个 App 的扫一扫
 * @param aggregatePay 聚合收款码（微信/支付宝都能付的那种）优先唤起哪个 App
 */
export function resolveAll(
  content: string,
  preferApp = "微信",
  aggregatePay: AggregatePayApp = "自动",
): ScanMatch[] {
  const raw = content.trim()
  if (!raw) return []

  const out: Candidate[] = []
  const host = hostOf(raw)
  const scheme = schemeOf(raw)
  const lower = raw.toLowerCase()
  const isUrl = isHttpUrl(raw)

  // ── 0. 内容本身就是 scheme：直接打开（微信未对外开放的 scheme 除外） ──
  if (scheme && scheme !== "http" && scheme !== "https" && canDirectOpen(scheme)) {
    const info = appInfoOf(raw)
    pushCandidate(out, raw, raw, info, `${info.name} 直连`, "链接跳转", scheme + ":", "scheme", 100000)
  }

  // ── 1. 内置核心规则 ────────────────────────────────────────────
  for (const core of CORE_RULES) {
    if (core.test(raw, host)) {
      pushCandidate(out, raw, core.build(raw), core.app, core.title, core.category, host, "core", core.score ?? 50000)
    }
  }

  // ── 2. 规则库 ──────────────────────────────────────────────────
  const tencentHost = isTencentHost(host)
  for (const r of compiled()) {
    const hit = matchLink(r.parts, raw, lower, host, isUrl)
    if (!hit) continue

    let quality = hit.q
    if (r.type === 2) {
      // type 2：link 与 regex 必须同时命中
      if (!r.regex || !r.regex.test(raw)) continue
      quality += 20
    }

    if (quality < 0) continue
    // us === "¥" 的规则只是「原样打开内容」，等于没做特殊处理，
    // 不应该盖过真正指定了目标 App 的规则（例如 u.wechat.com 的「微信分享链接」
    // 曾把微信号二维码顶到 Safari）。所以把它们的分类权重压到最低。
    const catScore = r.us === "¥" ? 60 : (CAT_SCORE[r.cat] ?? 150)
    let score = catScore + quality + Math.min(r.link.length, 40)

    const appInfo = r.us === "¥" ? appInfoOf(raw) : appInfoOf(r.us)
    if (appInfo.name === preferApp) score += 3 // 同分时偏向用户偏好

    // 腾讯系域名上，规则库推微信多半是选错了（见 isTencentHost 注释）。
    // 只降权不排除：没有 QQ 规则竞争时微信依然是第一名，不会误伤。
    if (tencentHost && /^weixin:/i.test(r.us)) score -= 500

    pushCandidate(out, raw, r.us, appInfo, r.title, r.cat, hit.m, "db", score)
  }

  // ── 2.5 域名 → App 直达（补齐 sumqt 没收录的 App） ─────────────
  // scan=true（有扫一扫直达）的只在「内容像登录码」时用——
  //   否则普通分享链接（知乎回答页之类）也会被顶去扫一扫。
  // scan=false（只有 App 首页）的任意链接都能用——打开 App 总比开浏览器强。
  const da = matchDomainApp(host)
  if (da && (da.onlyForLogin ? LOGIN_HINTS.test(raw) : true)) {
    pushCandidate(out, raw, da.scheme, da.app, da.title, "登录验证", host, "domain", 40000)
  }

  // ── 2.6 聚合收款码：按设置优先唤起某个 App ────────────────────────
  // 得分 30000：高于规则库（最高约 1500），低于核心规则（50000）——
  // 所以 qr.alipay.com / wxp:// 这类专属码依然走直达，不会被这个设置影响。
  if (aggregatePay !== "自动" && isAggregatePayHost(host)) {
    const t = AGGREGATE_PAY_TARGET[aggregatePay]
    if (t) {
      pushCandidate(
        out,
        raw,
        t.scheme,
        t.app,
        `${aggregatePay}扫一扫（聚合收款码）`,
        "收款支付",
        host,
        "aggregate",
        30000,
      )
    }
  }

  // ── 3. 回退 ────────────────────────────────────────────────────
  if (out.length === 0) {
    // 3a. 内容不是网址时，先看能不能从文本里认出 App
    if (!isUrl) {
      const hint = matchContentHint(raw)
      if (hint) {
        pushCandidate(out, raw, hint.scheme, hint.app, hint.title, "登录验证", host, "fallback", 1)
      }
    }
    // 3b. 网址就开浏览器
    if (isUrl) {
      pushCandidate(out, raw, raw, { name: "浏览器", icon: "safari.fill" }, "用浏览器打开", "链接跳转", host, "fallback", 1)
    }
    // 3c. 都不行就交给用户设置的默认 App 扫一扫
    const isAlipay = preferApp === "支付宝"
    pushCandidate(
      out,
      raw,
      isAlipay ? "alipays://platformapi/startapp?saId=10000007" : "weixin://scanqrcode",
      isAlipay ? { name: "支付宝", icon: "a.circle.fill" } : { name: "微信", icon: "message.fill" },
      `${preferApp}扫一扫`,
      "其他",
      "回退",
      "fallback",
      0,
    )
  }

  // ── 排序 + 去重 ────────────────────────────────────────────────
  out.sort((a, b) => b.sort - a.sort)

  const seen = new Set<string>()
  const result: ScanMatch[] = []
  for (const c of out) {
    if (seen.has(c.target)) continue
    seen.add(c.target)
    result.push(c)
    if (result.length >= 8) break
  }
  return result
}

/** 只要最优解 */
export function resolve(content: string, preferApp = "微信"): ScanMatch | null {
  const all = resolveAll(content, preferApp)
  return all.length ? all[0] : null
}

/** 从规则库搜索（规则库页面用） */export function searchRules(keyword: string, category: string, limit = 120) {
  const kw = keyword.trim().toLowerCase()
  const out: { title: string; link: string; cat: string; app: string; icon: string; target: string }[] = []
  for (const r of compiled()) {
    if (category && r.cat !== category) continue
    if (kw && !r.title.toLowerCase().includes(kw) && !r.link.toLowerCase().includes(kw)) continue
    const info = r.us === "¥" ? { name: "直接打开", icon: "arrow.up.forward.app" } : appInfoOf(r.us)
    out.push({
      title: r.title,
      link: r.link || r.regex?.source || "",
      cat: r.cat,
      app: info.name,
      icon: info.icon,
      target: r.us,
    })
    if (out.length >= limit) break
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 内容解析：告诉用户到底扫到了什么                                      */
/* ------------------------------------------------------------------ */

export interface ContentInfo {
  /** 内容类型，如「微信收款码」 */
  kind: string
  /** 一句话说明 + 能不能直跳 */
  detail: string
  scheme: string
  host: string
  /** 这个 scheme 能不能被外部 App 直接打开 */
  directOpenable: boolean
  /** 推荐的目标 URL */
  suggested: string
  suggestedApp: string
  suggestedIcon: string
}

function info(
  c: string,
  kind: string,
  detail: string,
  directOpenable: boolean,
  suggested: string,
  app: string,
  icon: string,
): ContentInfo {
  return {
    kind,
    detail,
    scheme: schemeOf(c),
    host: hostOf(c),
    directOpenable,
    suggested,
    suggestedApp: app,
    suggestedIcon: icon,
  }
}

/**
 * 解析扫描内容，判断它到底是什么、能不能直跳、不能的话该交给谁。
 */
export function describeContent(raw: string, aggregatePay: AggregatePayApp = "自动"): ContentInfo {
  const c = raw.trim()
  const h = hostOf(c)
  const scheme = schemeOf(c)

  // 微信收款码：wxp:// 未对外开放（实测 openURL 返回 false）
  if (/^wxp:\/\//i.test(c)) {
    return info(
      c,
      "微信收款码",
      "微信个人/商户收款码。微信没有对外开放 wxp:// 协议，外部 App 无法直接拉起付款，只能交给微信扫一扫再扫一次。",
      false,
      "weixin://scanqrcode",
      "微信",
      "message.fill",
    )
  }

  if (/^mmpay:/i.test(c)) {
    return info(
      c,
      "微信支付内部协议",
      "mmpay:// 属于微信内部协议，未对外开放，需要交给微信处理。",
      false,
      "weixin://scanqrcode",
      "微信",
      "message.fill",
    )
  }

  if (/^weixin:\/\/wxpay\//i.test(c)) {
    return info(c, "微信支付订单", "微信支付商户订单链接，可以直接唤起微信支付。", true, c, "微信", "message.fill")
  }

  if (/^weixin:/i.test(c)) {
    return info(c, "微信内部链接", "微信自身注册的协议，可以直接打开微信。", true, c, "微信", "message.fill")
  }

  if (/^wxwork:/i.test(c)) {
    return info(c, "企业微信链接", "可以直接唤起企业微信。", true, c, "企业微信", "building.2.fill")
  }

  if (h === "u.wechat.com" || h.endsWith(".u.wechat.com")) {
    return info(
      c,
      "微信号二维码",
      "微信个人名片二维码。u.wechat.com 在浏览器里只会提示「请在微信中打开」，必须交给微信扫一扫。",
      false,
      "weixin://scanqrcode",
      "微信",
      "message.fill",
    )
  }

  if (h === "weixin.qq.com" && /^https?:\/\/weixin\.qq\.com\/r\//i.test(c)) {
    return info(
      c,
      "微信号二维码（旧版短链）",
      "旧版微信个人名片短链，需要交给微信扫一扫。",
      false,
      "weixin://scanqrcode",
      "微信",
      "message.fill",
    )
  }

  if (/^alipay(s|qr)?:/i.test(c)) {
    return info(c, "支付宝链接", "可以直接唤起支付宝。", true, c, "支付宝", "a.circle.fill")
  }

  if (h === "qr.alipay.com" || h.endsWith(".qr.alipay.com")) {
    return info(
      c,
      "支付宝收款码",
      "支付宝商户收款码，可以把链接直接送进支付宝收银台，无需二次扫码。",
      false,
      `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(c)}`,
      "支付宝",
      "a.circle.fill",
    )
  }

  if (h.endsWith("alipay.cn")) {
    return info(
      c,
      "支付宝短链收款码",
      "支付宝收款短链，可以直接送进支付宝收银台。",
      false,
      `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(c)}`,
      "支付宝",
      "a.circle.fill",
    )
  }

  if (h === "95516.com" || h.endsWith(".95516.com")) {
    return info(
      c,
      "银联收款码",
      "中国银联收款码，交给云闪付扫一扫处理。",
      false,
      "upwallet://native/scanCode",
      "云闪付",
      "creditcard.fill",
    )
  }

  if (h.endsWith("tenpay.com")) {
    return info(c, "微信支付链接", "微信支付域名，交给微信扫一扫处理。", false, "weixin://scanqrcode", "微信", "message.fill")
  }

  // 聚合收款码：一张码微信/支付宝/云闪付都能付
  if (isAggregatePayHost(h)) {
    const t = aggregatePay !== "自动" ? AGGREGATE_PAY_TARGET[aggregatePay] : null
    return info(
      c,
      "聚合收款码",
      t
        ? `微信、支付宝、云闪付都能付的一张码，按设置优先用${aggregatePay}。下面也可以手动选别的。`
        : "微信、支付宝、云闪付都能付的一张码。去「设置 → 聚合收款码」可以指定优先用哪个 App。",
      false,
      t ? t.scheme : "",
      t ? t.app.name : "",
      t ? t.app.icon : "qrcode",
    )
  }

  const da = matchDomainApp(h)
  if (da && (da.onlyForLogin ? LOGIN_HINTS.test(c) : true)) {
    if (da.scan) {
      return info(
        c,
        LOGIN_HINTS.test(c) ? `${da.app.name}扫码登录` : `${da.app.name}扫码`,
        `这个域名归${da.app.name}，直接交给它的扫一扫。`,
        false,
        da.scheme,
        da.app.name,
        da.app.icon,
      )
    }
    return info(
      c,
      `${da.app.name}链接`,
      `${da.app.name}没有公开「扫一扫」直达入口，只能先打开 App，再用它自己的扫一扫。`,
      false,
      da.scheme,
      da.app.name,
      da.app.icon,
    )
  }

  if (/^https?:\/\//i.test(c)) {
    return info(c, "网址", "普通网页链接，按命中的规则跳转；没命中就用浏览器打开。", true, c, "浏览器", "safari.fill")
  }

  if (scheme) {
    const a = appInfoOf(c)
    return info(c, "其他 App 链接", `协议 ${scheme}://，尝试直接唤起对应 App。`, canDirectOpen(scheme), c, a.name, a.icon)
  }

  // 内容不是网址，但里面出现了某个 App 的关键字（有些二维码就是纯 token）
  const hint = matchContentHint(c)
  if (hint) {
    return info(
      c,
      `无法识别的内容（可能是${hint.app.name}）`,
      `不是网址，但里面出现了「${hint.app.name}」的关键字，所以按它的扫一扫推荐。不一定准，下面还有别的选项。`,
      false,
      hint.scheme,
      hint.app.name,
      hint.app.icon,
    )
  }

  return info(c, "纯文本", "不是链接，没有可跳转的目标。", false, "", "", "text.alignleft")
}
