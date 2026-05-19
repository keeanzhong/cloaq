import { attachDebugger, detachDebugger, detachDebuggerForTab } from './debugger.js'
import { buildIpConfiguration, hasSpoofingConfiguration } from './configurationUtils.js'
import { fetchIpProfile } from './ipLookup.js'

const SETTINGS_KEYS = [
  'configuration',
  'timezone',
  'locale',
  'languages',
  'lat',
  'lon',
  'ipUpdatedAt',
]
const IP_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const APPLY_DEBOUNCE_MS = 150

let applyAllTabsTimer = null
let ipRefreshPromise = null

const isConfigurableUrl = (url = '') =>
  !url ||
  url.startsWith('http://') ||
  url.startsWith('https://') ||
  url.startsWith('file://')

const getStoredSettings = () => chrome.storage.local.get(SETTINGS_KEYS)

const saveIpConfiguration = async (ipProfile) => {
  const ipConfiguration = buildIpConfiguration(ipProfile)
  if (!ipConfiguration) return null

  await chrome.storage.local.set({
    ...ipConfiguration,
    ipUpdatedAt: Date.now(),
    ipSource: ipProfile.source || null,
    ipAddress: ipProfile.ip || null,
    ipCountryCode: ipProfile.countryCode || null,
  })

  return ipConfiguration
}

const refreshIpConfiguration = async () => {
  if (!ipRefreshPromise) {
    ipRefreshPromise = fetchIpProfile()
      .then(saveIpConfiguration)
      .catch((error) => {
        console.error(error.message)
        return null
      })
      .finally(() => {
        ipRefreshPromise = null
      })
  }

  return ipRefreshPromise
}

const getEffectiveSettings = async () => {
  const settings = await getStoredSettings()

  if (settings.configuration !== 'ipAddress') return settings

  const hasStoredIpConfiguration = hasSpoofingConfiguration(settings)
  const isStale =
    !settings.ipUpdatedAt || Date.now() - settings.ipUpdatedAt > IP_REFRESH_INTERVAL_MS

  if (!hasStoredIpConfiguration) {
    return {
      ...settings,
      ...(await refreshIpConfiguration()),
    }
  }

  if (isStale) {
    refreshIpConfiguration()
  }

  return settings
}

const applySettingsToTab = async (tabId) => {
  if (!tabId) return

  const settings = await getEffectiveSettings()

  if (!hasSpoofingConfiguration(settings)) {
    detachDebuggerForTab(tabId)
    return
  }

  attachDebugger(
    tabId,
    settings.timezone,
    settings.locale,
    settings.lat,
    settings.lon,
    settings.languages
  )
}

const applySettingsToAllTabs = async () => {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs
      .filter((tab) => tab.id && isConfigurableUrl(tab.url))
      .map((tab) => applySettingsToTab(tab.id))
  )
}

const scheduleApplySettingsToAllTabs = () => {
  clearTimeout(applyAllTabsTimer)
  applyAllTabsTimer = setTimeout(applySettingsToAllTabs, APPLY_DEBOUNCE_MS)
}

const handleStartup = async () => {
  const settings = await getStoredSettings()
  if (settings.configuration === 'ipAddress') {
    refreshIpConfiguration()
  }
  scheduleApplySettingsToAllTabs()
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      active: true,
      url: 'html/info.html',
    })
  }

  handleStartup()
})

chrome.runtime.onStartup.addListener(handleStartup)

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && isConfigurableUrl(tab.url)) {
    applySettingsToTab(tab.id)
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  applySettingsToTab(tabId)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    (changeInfo.status === 'loading' || changeInfo.url) &&
    isConfigurableUrl(tab.url || changeInfo.url)
  ) {
    applySettingsToTab(tabId)
  }
})

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    applySettingsToTab(details.tabId)
  }
})

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    applySettingsToTab(details.tabId)
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return

  const relevantChange = SETTINGS_KEYS.some((key) => changes[key])
  if (!relevantChange) return

  if (changes.configuration?.newValue === 'browserDefault') {
    detachDebugger()
    return
  }

  scheduleApplySettingsToAllTabs()
})

handleStartup()
