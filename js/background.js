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
  'ipAddress',
  'ipCountryCode',
  'ipCheckIntervalSeconds',
]
const DEFAULT_IP_CHECK_INTERVAL_SECONDS = 5
const MIN_IP_CHECK_INTERVAL_SECONDS = 1
const MAX_IP_CHECK_INTERVAL_SECONDS = 300
const IP_POLL_ALARM_NAME = 'cloaq-ip-profile-poll'
const APPLY_DEBOUNCE_MS = 150

let applyAllTabsTimer = null
let ipCheckTimer = null
let ipRefreshPromise = null
let lastIpChangeReloadAt = 0

const isConfigurableUrl = (url = '') =>
  !url ||
  url.startsWith('http://') ||
  url.startsWith('https://') ||
  url.startsWith('file://')

const getStoredSettings = () => chrome.storage.local.get(SETTINGS_KEYS)

const getIpCheckIntervalSeconds = (settings = {}) => {
  const value = Number(settings.ipCheckIntervalSeconds)
  if (!Number.isFinite(value)) return DEFAULT_IP_CHECK_INTERVAL_SECONDS

  return Math.min(
    Math.max(value, MIN_IP_CHECK_INTERVAL_SECONDS),
    MAX_IP_CHECK_INTERVAL_SECONDS
  )
}

const buildStoredIpConfiguration = (ipProfile) => {
  const ipConfiguration = buildIpConfiguration(ipProfile)
  if (!ipConfiguration) return null

  return {
    ...ipConfiguration,
    ipUpdatedAt: Date.now(),
    ipSource: ipProfile.source || null,
    ipAddress: ipProfile.ip || null,
    ipCountryCode: ipProfile.countryCode || null,
  }
}

const hasFingerprintConfigurationChanged = (currentSettings, nextSettings) => {
  if (!nextSettings) return false

  return ['timezone', 'locale', 'languages', 'lat', 'lon'].some(
    (key) => String(currentSettings?.[key] ?? '') !== String(nextSettings[key] ?? '')
  )
}

const saveIpConfiguration = async (ipProfile) => {
  const currentSettings = await getStoredSettings()
  const nextSettings = buildStoredIpConfiguration(ipProfile)
  if (!nextSettings) return null

  const changed = hasFingerprintConfigurationChanged(
    currentSettings,
    nextSettings
  )

  await chrome.storage.local.set(nextSettings)

  return {
    changed,
    settings: nextSettings,
  }
}

const reloadConfigurableTabs = async () => {
  if (Date.now() - lastIpChangeReloadAt < 3000) return
  lastIpChangeReloadAt = Date.now()

  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs
      .filter((tab) => tab.id && isConfigurableUrl(tab.url))
      .map(
        (tab) =>
          new Promise((resolve) => {
            chrome.tabs.reload(tab.id, {}, () => resolve())
          })
      )
  )
}

const refreshIpConfiguration = async ({ reloadOnChange = false } = {}) => {
  if (!ipRefreshPromise) {
    ipRefreshPromise = fetchIpProfile()
      .then(saveIpConfiguration)
      .then(async (result) => {
        if (result?.changed) {
          scheduleApplySettingsToAllTabs()
          if (reloadOnChange) {
            await reloadConfigurableTabs()
          }
        }

        return result?.settings || null
      })
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

const scheduleNextIpCheck = (settings = {}) => {
  clearTimeout(ipCheckTimer)

  if (settings.configuration !== 'ipAddress') return

  const intervalSeconds = getIpCheckIntervalSeconds(settings)
  ipCheckTimer = setTimeout(() => {
    runIpCheckCycle({ reloadOnChange: true })
  }, intervalSeconds * 1000)
}

const runIpCheckCycle = async ({ reloadOnChange = true } = {}) => {
  const settings = await getStoredSettings()
  if (settings.configuration !== 'ipAddress') {
    scheduleNextIpCheck(settings)
    return null
  }

  const result = await refreshIpConfiguration({ reloadOnChange })
  scheduleNextIpCheck(await getStoredSettings())
  return result
}

const getEffectiveSettings = async () => {
  const settings = await getStoredSettings()

  if (settings.configuration !== 'ipAddress') return settings

  const hasStoredIpConfiguration = hasSpoofingConfiguration(settings)
  const intervalMs = getIpCheckIntervalSeconds(settings) * 1000
  const isStale =
    !settings.ipUpdatedAt ||
    Date.now() - settings.ipUpdatedAt > intervalMs

  if (!hasStoredIpConfiguration) {
    return {
      ...settings,
      ...(await refreshIpConfiguration({ reloadOnChange: false })),
    }
  }

  if (isStale) {
    refreshIpConfiguration({ reloadOnChange: true })
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
    runIpCheckCycle({ reloadOnChange: true })
  }
  scheduleNextIpCheck(settings)
  scheduleApplySettingsToAllTabs()
}

const ensureIpPollingAlarm = async () => {
  const settings = await getStoredSettings()
  const intervalMinutes = Math.max(
    getIpCheckIntervalSeconds(settings) / 60,
    0.5
  )

  chrome.alarms.create(IP_POLL_ALARM_NAME, {
    periodInMinutes: intervalMinutes,
  })
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      active: true,
      url: 'html/info.html',
    })
  }

  ensureIpPollingAlarm()
  handleStartup()
})

chrome.runtime.onStartup.addListener(handleStartup)

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== IP_POLL_ALARM_NAME) return

  runIpCheckCycle({ reloadOnChange: true })
})

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

  if (changes.configuration?.newValue === 'ipAddress') {
    runIpCheckCycle({ reloadOnChange: true })
  }

  ensureIpPollingAlarm()
  getStoredSettings().then(scheduleNextIpCheck)
  scheduleApplySettingsToAllTabs()
})

ensureIpPollingAlarm()
handleStartup()
