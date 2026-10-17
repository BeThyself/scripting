/** 设置与历史记录的本地持久化 */

/** 聚合收款码优先唤起哪个 App */
export type AggregatePayApp = "自动" | "微信" | "支付宝" | "云闪付"

export interface Settings {
  /** 启动脚本时立刻调起相机扫码 */
  scanOnLaunch: boolean
  /** 扫到后是否自动跳转 */
  autoOpen: boolean
  /** 无匹配时优先交给哪个 App 的扫一扫 */
  preferApp: "微信" | "支付宝"
  /** 聚合收款码（微信/支付宝都能付的那种）优先唤起哪个 App */
  aggregatePay: AggregatePayApp
  /** 是否记录历史 */
  keepHistory: boolean
}

export interface HistoryItem {
  raw: string
  target: string
  app: string
  icon: string
  title: string
  category: string
  time: number
}

const SETTINGS_KEY = "settings.v1"
const HISTORY_KEY = "history.v1"
/** 历史记录最多保留多少条，超出自动淘汰最旧的 */
export const MAX_HISTORY = 30

const DEFAULT_SETTINGS: Settings = {
  // 默认不自动扫码：在 Scripting 里点开脚本只看到界面。
  // 从小组件点进来时不受这个开关影响，总是直接扫码。
  scanOnLaunch: false,
  autoOpen: true,
  preferApp: "微信",
  aggregatePay: "自动",
  keepHistory: true,
}

export function loadSettings(): Settings {
  try {
    const s = Storage.get<Settings>(SETTINGS_KEY)
    if (s && typeof s === "object") return { ...DEFAULT_SETTINGS, ...s }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: Settings): void {
  try {
    Storage.set(SETTINGS_KEY, s)
  } catch {}
}

export function loadHistory(): HistoryItem[] {
  try {
    const h = Storage.get<HistoryItem[]>(HISTORY_KEY)
    if (Array.isArray(h)) return h
  } catch {}
  return []
}

export function addHistory(item: HistoryItem): HistoryItem[] {
  const list = loadHistory().filter((x) => !(x.raw === item.raw && x.target === item.target))
  list.unshift(item)
  const trimmed = list.slice(0, MAX_HISTORY)
  try {
    Storage.set(HISTORY_KEY, trimmed)
  } catch {}
  return trimmed
}

export function clearHistory(): void {
  try {
    Storage.remove(HISTORY_KEY)
  } catch {}
}

/** 改名前把旧身份的数据导出到共享域时用的 key */
const LEGACY_HISTORY_KEY = "migrate.aggregate.history.v1"

/**
 * 一次性迁移。
 *
 * Scripting 的 Storage 是按 `script.json` 里的 `name` 隔离的（不是文件夹名）——
 * 改名 = 换身份 = 读不到旧数据。改名时先把旧数据导出到了共享域，
 * 这里在首次运行时搬回私有域，搬完就清掉暂存，不会重复执行。
 */
export function migrateLegacyData(): void {
  try {
    const legacy = Storage.get<HistoryItem[]>(LEGACY_HISTORY_KEY, { shared: true })
    if (!legacy || !Array.isArray(legacy) || legacy.length === 0) return
    // 已经有数据了就不覆盖（用户可能已经在用新身份了）
    if (loadHistory().length === 0) {
      Storage.set(HISTORY_KEY, legacy.slice(0, MAX_HISTORY))
    }
    Storage.remove(LEGACY_HISTORY_KEY, { shared: true })
  } catch {
    // 迁移失败不影响正常使用
  }
}

/** 相对时间显示 */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
