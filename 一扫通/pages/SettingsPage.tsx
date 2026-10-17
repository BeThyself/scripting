import {
  useState,
  List,
  Section,
  Text,
  Button,
  HStack,
  VStack,
  Image,
  Spacer,
  Toggle,
  Picker,
} from "scripting"
import type { Settings } from "../store"
import { loadHistory, clearHistory, MAX_HISTORY } from "../store"
import { ruleCount, QQ_SCAN_SCHEME } from "../engine"

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
}

const PROBES: [string, string, string][] = [
  ["微信扫一扫", "message.fill", "weixin://scanqrcode"],
  ["支付宝扫一扫", "a.circle.fill", "alipays://platformapi/startapp?saId=10000007"],
  ["云闪付扫一扫", "creditcard.fill", "upwallet://native/scanCode"],
  ["QQ 扫一扫", "bubble.left.and.bubble.right.fill", QQ_SCAN_SCHEME],
]

export default function SettingsPage({ settings, onChange }: Props) {
  const [probeLog, setProbeLog] = useState<string>("")
  const [historyCount, setHistoryCount] = useState<number>(() => loadHistory().length)

  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p })

  const runProbe = async (name: string, url: string) => {
    setProbeLog(`正在尝试打开「${name}」…`)
    try {
      const ok = await Safari.openURL(url)
      // 注意：App 切到后台后返回值可能为 false，即使跳转其实成功了。
      setProbeLog(
        ok
          ? `✅ ${name}：openURL 返回 true`
          : `⚠️ ${name}：openURL 返回 false（若已切到该 App，说明实际跳转是成功的，返回值不可靠）`,
      )
    } catch (e) {
      setProbeLog(`❌ ${name} 出错：${e}`)
    }
  }

  return (
    <List navigationTitle="设置" navigationBarTitleDisplayMode="large">
      <Section
        header={<Text>扫码</Text>}
        footer={
          <Text>
            只影响在 Scripting 里手动运行脚本的情况。从桌面 / 锁屏小组件点进来时，总会直接打开相机扫码，不受这个开关影响。
          </Text>
        }
      >
        <Toggle
          title="打开脚本即扫码"
          systemImage="qrcode.viewfinder"
          value={settings.scanOnLaunch}
          onChanged={(v) => patch({ scanOnLaunch: v })}
        />
      </Section>

      <Section header={<Text>跳转行为</Text>}>
        <Toggle
          title="扫到后自动跳转"
          systemImage="bolt.fill"
          value={settings.autoOpen}
          onChanged={(v) => patch({ autoOpen: v })}
        />
        <Picker
          title="无匹配时优先"
          systemImage="arrow.triangle.branch"
          value={settings.preferApp}
          onChanged={(v: string) => patch({ preferApp: v as Settings["preferApp"] })}
        >
          <Text tag="微信">微信扫一扫</Text>
          <Text tag="支付宝">支付宝扫一扫</Text>
        </Picker>
        <Toggle
          title="保留跳转记录"
          systemImage="clock.arrow.circlepath"
          value={settings.keepHistory}
          onChanged={(v) => patch({ keepHistory: v })}
        />
      </Section>

      <Section
        header={<Text>聚合收款码</Text>}
        footer={
          <Text>
            一张码微信、支付宝、云闪付都能付的那种（收钱吧、银盛、拉卡拉、利楚扫呗、乐刷、富友、易宝、银联商务、各行收款码…）。
            规则库会自动识别这类域名（共 69 个），这里决定优先唤起哪个 App。
            选「自动」则完全跟随规则库的判断。
          </Text>
        }
      >
        <Picker
          title="优先唤起"
          systemImage="qrcode"
          value={settings.aggregatePay}
          onChanged={(v: string) => patch({ aggregatePay: v as Settings["aggregatePay"] })}
        >
          <Text tag="自动">自动（跟随规则库）</Text>
          <Text tag="微信">微信扫一扫</Text>
          <Text tag="支付宝">支付宝扫一扫</Text>
          <Text tag="云闪付">云闪付扫一扫</Text>
        </Picker>
      </Section>

      <Section
        header={<Text>跳转自检</Text>}
        footer={
          <Text>
            逐个验证目标 App 的 URL Scheme 是否可用。因为跳转会切走 App，openURL 的返回值并不可靠 ——
            只要成功切到对应 App，就说明这条 Scheme 有效。
          </Text>
        }
      >
        {PROBES.map(([name, icon, url]) => (
          <Button key={name} action={() => runProbe(name, url)}>
            <HStack spacing={10}>
              <Image systemName={icon} font={22} foregroundStyle="systemBlue" frame={{ width: 32 }} />
              <VStack alignment="leading" spacing={2}>
                <Text font="subheadline" fontWeight="semibold">
                  {name}
                </Text>
                <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                  {url}
                </Text>
              </VStack>
              <Spacer />
              <Image systemName="arrow.up.forward.app" foregroundStyle="secondaryLabel" />
            </HStack>
          </Button>
        ))}
        {probeLog ? (
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {probeLog}
          </Text>
        ) : null}
      </Section>

      <Section
        header={<Text>隐私</Text>}
        footer={
          <Text>
            扫码记录只写入本机 Scripting 的「脚本私有存储」（Storage），全程不联网、不上传任何服务器。
            代码里没有任何网络请求，跳转规则也是内置在脚本里的。关闭开关后不再新增记录，已有记录需手动清空。
          </Text>
        }
      >
        <HStack>
          <Text>已保存记录</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">
            {historyCount} / {MAX_HISTORY} 条
          </Text>
        </HStack>
        <HStack>
          <Text>存储位置</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">本机 · 脚本私有域</Text>
        </HStack>
        <Button
          title="清空所有记录"
          systemImage="trash"
          role="destructive"
          action={() => {
            clearHistory()
            setHistoryCount(0)
          }}
        />
      </Section>

      <Section header={<Text>关于</Text>}>
        <HStack>
          <Text>规则条数</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">{ruleCount()}</Text>
        </HStack>
        <HStack>
          <Text>规则来源</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">sumqt.com</Text>
        </HStack>
        <HStack>
          <Text>匹配引擎</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">分类权重 + 域名精度</Text>
        </HStack>
      </Section>

      <Section footer={<Text>支付类规则优先于登录类，登录类优先于其他；同分类下按域名匹配精度排序。</Text>}>
        <VStack alignment="leading" spacing={4}>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            微信支付商户码会交回「微信扫一扫」；支付宝收款码则直接把链接送进支付宝收银台，
            省掉二次扫码。
          </Text>
        </VStack>
      </Section>
    </List>
  )
}
