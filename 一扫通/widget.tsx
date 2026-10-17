import { Widget, VStack, HStack, Text, Image, Spacer, Script } from "scripting"
import { loadHistory, timeAgo, type HistoryItem } from "./store"

/**
 * 点小组件 = 跑脚本并带上 from=widget。
 * index.tsx 里读 Script.queryParameters.from 就知道是从小组件来的，从而直接扫码。
 */
const RUN_URL = Script.createRunURLScheme("一扫通", { from: "widget" })

/**
 * 背景处理（重要）。
 *
 * 用户如果给小组件开了「透明背景 / 模糊背景 / 模拟透明」，背景是由系统画的。
 * 这时再填 systemBackground 会把系统背景整个盖住，小组件变成一块死白板。
 * 所以这几种模式下不要设 widgetBackground。
 */
const SYSTEM_DRAWN_BG =
  !!Widget.isTransparentBackground || !!Widget.isTransparentMode || !!Widget.isBlurMode

const HOME_BG: { widgetBackground?: "systemBackground" } = SYSTEM_DRAWN_BG
  ? {}
  : { widgetBackground: "systemBackground" }

function last(): HistoryItem | null {
  try {
    const h = loadHistory()
    return h.length ? h[0] : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* 桌面小组件：只做 systemSmall                                        */
/* ------------------------------------------------------------------ */

function SmallView() {
  const item = last()
  return (
    <VStack
      spacing={5}
      padding={12}
      alignment="center"
      frame={Widget.displaySize}
      widgetURL={RUN_URL}
      {...HOME_BG}
    >
      <Image systemName="qrcode.viewfinder" font={40} foregroundStyle="systemBlue" />
      <Text font="headline" fontWeight="bold" lineLimit={1}>
        一扫通
      </Text>
      <Text font="caption2" foregroundStyle="secondaryLabel">
        点按扫码
      </Text>
      {item ? (
        <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
          上次 {item.app} · {timeAgo(item.time)}
        </Text>
      ) : null}
    </VStack>
  )
}

/* ------------------------------------------------------------------ */
/* 锁屏小组件                                                          */
/* ------------------------------------------------------------------ */

/** 圆形：只有图标 + 两个字，字多了会被圆形裁掉 */
function CircularView() {
  return (
    <VStack spacing={1} alignment="center" frame={Widget.displaySize} widgetURL={RUN_URL}>
      <Image systemName="qrcode.viewfinder" font={24} />
      <Text font="caption2" fontWeight="semibold">
        扫码
      </Text>
    </VStack>
  )
}

/** 矩形：标题 + 上次记录（没有记录就提示点按） */
function RectangularView() {
  const item = last()
  return (
    <HStack spacing={8} frame={Widget.displaySize} widgetURL={RUN_URL}>
      <Image systemName="qrcode.viewfinder" font={24} />
      <VStack alignment="leading" spacing={1}>
        <Text font="headline" lineLimit={1}>
          一扫通
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {item ? `${item.app} · ${timeAgo(item.time)}` : "点按开始扫码"}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  )
}

/* ------------------------------------------------------------------ */

function WidgetView() {
  switch (Widget.family) {
    case "accessoryCircular":
      return <CircularView />
    case "accessoryRectangular":
      return <RectangularView />
    // 桌面只做 systemSmall；万一被加到其它尺寸，也用同一套布局兜底
    default:
      return <SmallView />
  }
}

Widget.present(<WidgetView />)
