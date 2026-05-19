import locationsConfigurations from './locationsConfigurations.js'
import {
  applyPopupTranslations,
  detectUiLanguage,
  getSupportedUiLanguage,
} from './i18n.js'
import { buildIpConfiguration, buildLanguagesForLocale } from './configurationUtils.js'
import { fetchIpProfile } from './ipLookup.js'

const extensionVersion = chrome.runtime.getManifest().version
document.getElementById('extensionVersion').textContent = `v${extensionVersion}`

const reloadButton = document.getElementById('reloadButton')
const infoButton = document.getElementById('infoButton')
const uiLanguageSelect = document.querySelector('select[name="uiLanguage"]')
const configurationSelect = document.querySelector(
  'select[name="configuration"]'
)
const locationsOptGroup = document.getElementById('locationsOptGroup')
const timeZoneInput = document.querySelector('input[name="timeZone"]')
const localeInput = document.querySelector('input[name="locale"]')
const languagesInput = document.querySelector('input[name="languages"]')
const ipCheckIntervalInput = document.querySelector(
  'input[name="ipCheckIntervalSeconds"]'
)
const latitudeInput = document.querySelector('input[name="latitude"]')
const longitudeInput = document.querySelector('input[name="longitude"]')
// const debuggerApiModeCheckbox = document.querySelector(
//   'input[name="debuggerApiMode"]'
// )

let ipProfile = null

// Add location options to the select menu
Object.entries(locationsConfigurations).forEach(([key, location]) => {
  const option = document.createElement('option')
  option.value = key
  option.textContent = location.name
  locationsOptGroup.appendChild(option)
})

const refreshIpProfile = async () => {
  ipProfile = await fetchIpProfile()
  return ipProfile
}

const applyIpConfiguration = async () => {
  if (!ipProfile) await refreshIpProfile()

  const ipConfiguration = buildIpConfiguration(ipProfile)
  if (ipConfiguration) {
    setInputs(
      ipConfiguration.timezone,
      ipConfiguration.locale,
      ipConfiguration.languages,
      ipConfiguration.lat,
      ipConfiguration.lon
    )
  }
}

const handleConfigurationChange = async () => {
  const configuration = configurationSelect.value

  if (configuration === 'browserDefault' || configuration === 'custom') {
    clearInputs()
  } else if (configuration === 'ipAddress') {
    try {
      await applyIpConfiguration()
    } catch (error) {
      console.error(error.message)
    }
  } else {
    const selectedLocation = locationsConfigurations[configuration]
    if (selectedLocation) {
      setInputs(
        selectedLocation.timezone,
        selectedLocation.locale,
        buildLanguagesForLocale(selectedLocation.locale),
        selectedLocation.lat,
        selectedLocation.lon
      )
    } else {
      console.error('Unrecognized configuration. Please select a valid option.')
    }
  }

  await saveToStorage()
}

const clearInputs = () => setInputs('', '', '', '', '')

const normalizeIpCheckInterval = (value) => {
  const interval = Number.parseInt(value, 10)
  if (!Number.isFinite(interval)) return 5
  return Math.min(Math.max(interval, 1), 300)
}

const formatCoordinateInput = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  return Number.isFinite(Number(value)) ? value : ''
}

const setInputs = (timezone, locale, languages, lat, lon) => {
  timeZoneInput.value = timezone || ''
  localeInput.value = locale || ''
  languagesInput.value = languages || ''
  latitudeInput.value = formatCoordinateInput(lat)
  longitudeInput.value = formatCoordinateInput(lon)
}

const saveToStorage = async () => {
  await chrome.storage.local.set({
    configuration: configurationSelect.value,
    timezone: timeZoneInput.value || null,
    locale: localeInput.value || null,
    languages: languagesInput.value || null,
    ipCheckIntervalSeconds: normalizeIpCheckInterval(
      ipCheckIntervalInput.value
    ),
    lat: Number.isFinite(parseFloat(latitudeInput.value))
      ? parseFloat(latitudeInput.value)
      : null,
    lon: Number.isFinite(parseFloat(longitudeInput.value))
      ? parseFloat(longitudeInput.value)
      : null,
    // useDebuggerApi: debuggerApiModeCheckbox.checked,
  })
}

const saveUiLanguage = async () => {
  const uiLanguage = getSupportedUiLanguage(uiLanguageSelect.value)
  uiLanguageSelect.value = uiLanguage
  applyPopupTranslations(uiLanguage)
  await chrome.storage.local.set({ uiLanguage })
}

const loadFromStorage = async () => {
  try {
    const storage = await chrome.storage.local.get([
      'configuration',
      'timezone',
      'locale',
      'languages',
      'ipCheckIntervalSeconds',
      'lat',
      'lon',
      'uiLanguage',
      // 'useDebuggerApi',
    ])

    uiLanguageSelect.value = getSupportedUiLanguage(
      storage.uiLanguage || detectUiLanguage()
    )
    applyPopupTranslations(uiLanguageSelect.value)

    configurationSelect.value = storage.configuration || 'browserDefault'
    ipCheckIntervalInput.value = normalizeIpCheckInterval(
      storage.ipCheckIntervalSeconds
    )
    setInputs(
      storage.timezone,
      storage.locale,
      storage.languages,
      storage.lat,
      storage.lon
    )
    // debuggerApiModeCheckbox.checked = storage.useDebuggerApi || false
  } catch (error) {
    console.error('Error loading from storage:', error)
  }
}

// Debounce function to limit frequent save calls
const debounce = (func, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const debouncedSaveToStorage = debounce(saveToStorage, 300)

const handleInputChange = () => {
  configurationSelect.value = 'custom'
  debouncedSaveToStorage()
}

reloadButton.addEventListener('click', () => chrome.tabs.reload())
infoButton.addEventListener('click', () =>
  chrome.tabs.create({ url: 'html/info.html' })
)
uiLanguageSelect.addEventListener('change', saveUiLanguage)
configurationSelect.addEventListener('change', handleConfigurationChange)
timeZoneInput.addEventListener('input', handleInputChange)
localeInput.addEventListener('input', handleInputChange)
languagesInput.addEventListener('input', handleInputChange)
ipCheckIntervalInput.addEventListener('input', debouncedSaveToStorage)
latitudeInput.addEventListener('input', handleInputChange)
longitudeInput.addEventListener('input', handleInputChange)
// debuggerApiModeCheckbox.addEventListener('change', saveToStorage)

await loadFromStorage()

if (configurationSelect.value === 'ipAddress') {
  await handleConfigurationChange()
} else {
  refreshIpProfile().catch((error) => console.error(error.message))
}
