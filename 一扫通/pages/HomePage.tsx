import {
  useState,
  useEffect,
  useMemo,
  useRef,
  Widget,
  List,
  Section,
  Text,
  Button,
  HStack,
  VStack,
  Image,
  Spacer,
  Divider,
  TextField,
  NavigationLink,
  ProgressView,
  Script,
} from "scripting"
import { resolveAll, describeContent, type ScanMatch } from "../engine"
import {
  type Settings,
  type HistoryItem,
  MAX_HISTORY,
  loadHistory,
  addHistory,
  clearHistory,
  timeAgo,
} from "../store"

interface Props {
  settings: Settings
}

function AppIcon({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <Image
      systemName={name}
      font={size}
      foregroundStyle="systemBlue"
      frame={{ width: size + 8 }}
    />
  )
}

function MatchRow({ match, onOpen, recommended }: { match: ScanMatch; onOpen: () => void; recommended?: boolean }) {
  return (
    <Button action={onOpen}>
      <HStack spacing={10}>
        <AppIcon name={match.icon} />
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={6}>
            <Text font="body" fontWeight="semibold">
              {match.app}
            </Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {match.title}
            </Text>
            {recommended ? (
              <Text
                font="caption2"
                foregroundStyle="white"
                padding={{ horizontal: 6, vertical: 2 }}
                background="systemBlue"
                clipShape="capsule"
              >
                推荐
              </Text>
            ) : null}
          </HStack>
          <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
            {match.target}
          </Text>
        </VStack>
        <Spacer />
      </HStack>
    </Button>
  )
}

export default function HomePage({ settings }: Props) {
  const [content, setContent] = useState("")
  const [matches, setMatches] = useState<ScanMatch[]>([])
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState("")
  const [message, setMessage] = useState("")
  const launched = useRef(false)

  const info = useMemo(
    () => (content ? describeContent(content, settings.aggregatePay) : null),
    [content, settings.aggregatePay],
  )

  const openMatch = async (match: ScanMatch) => {
    if (settings.keepHistory) {
      setHistory(
        addHistory({
          raw: match.raw,
          target: match.target,
          app: match.app,
          icon: match.icon,
          title: match.title,
          category: match.category,
          time: Date.now(),
        }),
      )
      try {
        // 让桌面/锁屏小组件的「最近记录」跟着刷新
        Widget.reloadAll()
      } catch {}
    }
    try {
      const ok = await Safari.openURL(match.target)
      // 返回值不完全可靠：App 被切到后台时也可能返回 false，
      // 所以只当提示用，不当成功/失败判据。
      setMessage(
        ok ? `已唤起 ${match.app}` : `已尝试唤起 ${match.app}；如果没反应，试试下面其他选项`,
      )
    } catch (e) {
      setMessage(`跳转失败：${e}`)
    }
  }

  const handleContent = (text: string, auto = true) => {
    const t = text.trim()
    if (!t) return
    const list = resolveAll(t, settings.preferApp, settings.aggregatePay)
    setContent(t)
    setMatches(list)
    setMessage(list.length ? `命中 ${list.length} 条可用跳转` : "没有可用跳转")
    if (auto && settings.autoOpen && list.length > 0) {
      setTimeout(() => {
        openMatch(list[0])
      }, 500)
    }
  }

  const doScan = async () => {
    setBusy(true)
    setMessage("")
    try {
      const result = await QRCode.scan()
      if (!result) {
        setMessage("已取消扫码")
      } else {
        handleContent(result)
      }
    } catch (e) {
      setMessage(`扫码出错：${e}`)
    }
    setBusy(false)
  }

  // 启动即扫码。
  //  - 从桌面 / 锁屏小组件点进来（widgetURL 带 from=widget）→ **总是**直接扫码；
  //  - 在 Scripting 里手动运行 → 看设置里的 scanOnLaunch。
  // 等一拍再调起原生扫码页，避免与页面呈现抢资源。
  useEffect(() => {
    const fromWidget = Script.queryParameters?.from === "widget"
    if (!fromWidget && !settings.scanOnLaunch) return
    if (launched.current) return
    launched.current = true
    const t = setTimeout(() => {
      doScan()
    }, fromWidget ? 150 : 300)
    return () => clearTimeout(t)
  }, [])

  const fromAlbum = async () => {
    setBusy(true)
    setMessage("")
    try {
      const images = await Photos.pickPhotos(1)
      if (!images || images.length === 0) {
        setMessage("未选择图片")
      } else {
        const text = await QRCode.parseImage(images[0])
        if (text == null) setMessage("图片里没有识别到二维码")
        else handleContent(text)
      }
    } catch (e) {
      setMessage(`识别出错：${e}`)
    }
    setBusy(false)
  }

  return (
    <List navigationTitle="一扫通" navigationBarTitleDisplayMode="large">
      <Section footer={<Text>启动脚本时会自动调起扫码；这里可以随时重扫。</Text>}>
        <Button
          title={busy ? "处理中…" : content ? "再扫一次" : "扫一扫"}
          systemImage="qrcode.viewfinder"
          action={doScan}
        />
        <Button title="从相册识别" systemImage="photo.on.rectangle" action={fromAlbum} />
      </Section>

      {message ? (
        <Section>
          <HStack spacing={8}>
            <Image systemName="info.circle" foregroundStyle="secondaryLabel" />
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {message}
            </Text>
          </HStack>
        </Section>
      ) : null}

      {matches.length > 0 ? (
        <Section
          header={<Text>识别结果</Text>}
          footer={<Text>点击任意一行即可跳转；推荐项会按分类权重自动选中。</Text>}
        >
          <VStack alignment="leading" spacing={8}>
            <HStack spacing={6}>
              <Image systemName={info?.suggestedIcon ?? "doc.text"} font={16} foregroundStyle="systemBlue" />
              <Text font="subheadline" fontWeight="semibold">
                {info?.kind ?? "已识别"}
              </Text>
              <Spacer />
              {info ? (
                <Text
                  font="caption2"
                  foregroundStyle={info.directOpenable ? "systemGreen" : "systemOrange"}
                  padding={{ horizontal: 8, vertical: 3 }}
                  background="systemFill"
                  clipShape="capsule"
                >
                  {info.directOpenable ? "可直跳" : "需转交"}
                </Text>
              ) : null}
            </HStack>
            {info ? (
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {info.detail}
              </Text>
            ) : null}
            <Divider />
            <Text font="caption" foregroundStyle="tertiaryLabel">
              扫到的内容（{content.length} 字符）
            </Text>
            <Text font="footnote" lineLimit={4} textSelection={true}>
              {content}
            </Text>
            <Button
              title="复制原始内容"
              systemImage="doc.on.doc"
              action={() => {
                Pasteboard.setString(content).catch(() => {})
                setMessage("已复制原始内容")
              }}
            />
          </VStack>
          {matches.map((m, i) => (
            <MatchRow key={m.target + i} match={m} onOpen={() => openMatch(m)} recommended={i === 0} />
          ))}
        </Section>
      ) : null}

      <Section
        header={<Text>手动测试</Text>}
        footer={<Text>把二维码里的内容粘贴进来，同样可以解析跳转。</Text>}
      >
        <TextField
          title="内容"
          prompt="https://qr.alipay.com/… 或 weixin://…"
          value={manual}
          onChanged={setManual}
        />
        <Button
          title="解析并跳转"
          systemImage="arrow.up.forward.app"
          action={() => {
            if (manual.trim()) handleContent(manual)
          }}
        />
      </Section>

      <Section
        header={<Text>最近记录</Text>}
        footer={
          <Text>
            {history.length === 0
              ? `最多保留 ${MAX_HISTORY} 条`
              : `已存 ${history.length} / ${MAX_HISTORY} 条 · 超出后自动淘汰最旧的`}
          </Text>
        }
      >
        {history.length === 0 ? (
          <Text font="footnote" foregroundStyle="secondaryLabel">
            还没有记录
          </Text>
        ) : (
          history.map((h, i) => (
            <Button
              key={i}
              action={() => openMatch(h as unknown as ScanMatch)}
            >
              <HStack spacing={10}>
                <AppIcon name={h.icon} size={22} />
                <VStack alignment="leading" spacing={2}>
                  <Text font="subheadline" fontWeight="semibold">
                    {h.app} · {h.title}
                  </Text>
                  <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                    {h.raw}
                  </Text>
                </VStack>
                <Spacer />
                <Text font="caption2" foregroundStyle="tertiaryLabel">
                  {timeAgo(h.time)}
                </Text>
              </HStack>
            </Button>
          ))
        )}
        {history.length > 0 ? (
          <Button
            title="清空记录"
            role="destructive"
            action={() => {
              clearHistory()
              setHistory([])
            }}
          />
        ) : null}
      </Section>
    </List>
  )
}
