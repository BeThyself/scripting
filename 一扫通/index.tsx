import {
  Navigation,
  NavigationStack,
  Script,
  Tab,
  TabView,
  useState,
  useObservable,
} from "scripting"
import HomePage from "./pages/HomePage"
import RulesPage from "./pages/RulesPage"
import SettingsPage from "./pages/SettingsPage"
import { loadSettings, migrateLegacyData, saveSettings, type Settings } from "./store"

function App({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const selection = useObservable<number>(0)

  const updateSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  return (
    <TabView selection={selection}>
      <Tab title="扫码" systemImage="qrcode.viewfinder" value={0}>
        <NavigationStack>
          <HomePage settings={settings} />
        </NavigationStack>
      </Tab>
      <Tab title="规则库" systemImage="list.bullet.rectangle" value={1}>
        <NavigationStack>
          <RulesPage />
        </NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape" value={2}>
        <NavigationStack>
          <SettingsPage settings={settings} onChange={updateSettings} />
        </NavigationStack>
      </Tab>
    </TabView>
  )
}

async function run() {
  // 改名带来的历史记录迁移（一次性，搬完即失效）
  migrateLegacyData()
  // 先把界面呈现出来，HomePage 挂载后会立刻调起原生扫码页（见 scanOnLaunch）。
  await Navigation.present(<App initialSettings={loadSettings()} />)
  Script.exit()
}

run()
