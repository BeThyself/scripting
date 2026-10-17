import {
  useState,
  useMemo,
  List,
  Section,
  Text,
  Button,
  HStack,
  VStack,
  Image,
  Spacer,
  TextField,
  ScrollView,
} from "scripting"
import { searchRules, ruleCount } from "../engine"
import { DB } from "../rules"

const ALL = "全部"

export default function RulesPage() {
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState(ALL)
  const [message, setMessage] = useState("")

  const cats = useMemo(() => [ALL, ...DB.c], [])
  const total = useMemo(() => ruleCount(), [])

  const items = useMemo(
    () => searchRules(keyword, category === ALL ? "" : category, 120),
    [keyword, category],
  )

  const showEmptyHint = !keyword.trim() && category === ALL

  return (
    <List navigationTitle="规则库" navigationBarTitleDisplayMode="large">
      <Section
        header={<Text>搜索</Text>}
        footer={
          <Text>
            共 {total} 条跳转规则，来自 sumqt.com 自定义方案中心。点击任意规则可复制它的目标 URL Scheme。
          </Text>
        }
      >
        <TextField
          title="关键词"
          prompt="商户名、域名，例如 收钱吧 / alipay"
          value={keyword}
          onChanged={setKeyword}
        />
      </Section>

      <Section header={<Text>分类</Text>}>
        <ScrollView axes="horizontal">
          <HStack spacing={8}>
            {cats.map((c) => {
              const active = c === category
              return (
                <Button key={c} action={() => setCategory(c)}>
                  <Text
                    font="footnote"
                    foregroundStyle={active ? "white" : "label"}
                    padding={{ horizontal: 12, vertical: 6 }}
                    background={active ? "systemBlue" : "systemFill"}
                    clipShape="capsule"
                  >
                    {c}
                  </Text>
                </Button>
              )
            })}
          </HStack>
        </ScrollView>
      </Section>

      {message ? (
        <Section>
          <HStack spacing={8}>
            <Image systemName="checkmark.circle" foregroundStyle="systemGreen" />
            <Text font="footnote" foregroundStyle="secondaryLabel" lineLimit={2}>
              {message}
            </Text>
          </HStack>
        </Section>
      ) : null}

      {showEmptyHint ? (
        <Section>
          <VStack alignment="leading" spacing={6}>
            <Text font="headline">选择一个分类或输入关键词</Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              重点推荐：「收款支付」633 条、「登录验证」341 条 —— 覆盖微信支付、支付宝、云闪付、QQ 登录等主流扫码场景。
            </Text>
          </VStack>
        </Section>
      ) : (
        <Section header={<Text>{category === ALL ? "全部" : category}（{items.length}）</Text>}>
          {items.length === 0 ? (
            <Text font="footnote" foregroundStyle="secondaryLabel">
              没有匹配的规则
            </Text>
          ) : (
            items.map((r, i) => (
              <Button
                key={i}
                action={() => {
                  const text = r.target
                  setMessage(`已复制：${text}`)
                  Pasteboard.setString(text).catch(() => {})
                }}
              >
                <HStack spacing={10}>
                  <Image
                    systemName={r.icon}
                    font={22}
                    foregroundStyle="systemBlue"
                    frame={{ width: 32 }}
                  />
                  <VStack alignment="leading" spacing={2}>
                    <Text font="subheadline" fontWeight="semibold" lineLimit={1}>
                      {r.title}
                    </Text>
                    <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={1}>
                      {r.link || "—"} · {r.cat}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {r.app}
                  </Text>
                </HStack>
              </Button>
            ))
          )}
        </Section>
      )}
    </List>
  )
}
