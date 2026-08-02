import locationsConfigurations from './locationsConfigurations.js'
import {
  applyPopupTranslations,
  getUiLanguageMode,
  resolveUiLanguage,
  translate,
} from './i18n.js'
import { buildIpConfiguration, buildLanguagesForLocale } from './configurationUtils.js'
import { fetchIpProfile } from './ipLookup.js'
import {
  normalizeExcludedSites,
  normalizeSiteHost,
} from './siteExclusions.js'

const extensionVersion = chrome.runtime.getManifest().version
document.getElementById('extensionVersion').textContent = `v${extensionVersion}`

const reloadButton = document.getElementById('reloadButton')
const infoButton = document.getElementById('infoButton')
const uiLanguageSelect = document.querySelector('select[name="uiLanguage"]')
const extensionEnabledInput = document.querySelector(
  'input[name="extensionEnabled"]'
)
const excludedSiteInput = document.getElementById('excludedSiteInput')
const addExcludedSiteButton = document.getElementById(
  'addExcludedSiteButton'
)
const excludeCurrentSiteButton = document.getElementById(
  'excludeCurrentSiteButton'
)
const excludedSiteError = document.getElementById('excludedSiteError')
const noExcludedSites = document.getElementById('noExcludedSites')
const excludedSitesList = document.getElementById('excludedSitesList')
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
let excludedSites = []

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

const getCurrentUiLanguage = () => {
  const useConfiguredTimeZone =
    extensionEnabledInput.checked &&
    configurationSelect.value !== 'browserDefault'
  return resolveUiLanguage(
    uiLanguageSelect.value,
    useConfiguredTimeZone ? timeZoneInput.value : ''
  )
}

const applyCurrentUiLanguage = () => {
  const uiLanguage = getCurrentUiLanguage()
  applyPopupTranslations(uiLanguage)
  renderExcludedSites()
}

const setExcludedSiteError = (visible) => {
  excludedSiteError.hidden = !visible
}

const renderExcludedSites = () => {
  excludedSitesList.replaceChildren()
  noExcludedSites.hidden = excludedSites.length > 0

  const removeLabel = translate(
    getCurrentUiLanguage(),
    'removeExcludedSite'
  )

  excludedSites.forEach((site) => {
    const row = document.createElement('div')
    row.className = 'excluded-site-row'

    const host = document.createElement('span')
    host.className = 'excluded-site-host'
    host.textContent = site

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'excluded-site-remove'
    removeButton.textContent = '×'
    removeButton.title = `${removeLabel}: ${site}`
    removeButton.setAttribute('aria-label', `${removeLabel}: ${site}`)
    removeButton.addEventListener('click', () => removeExcludedSite(site))

    row.append(host, removeButton)
    excludedSitesList.append(row)
  })
}

const saveExcludedSites = async (sites) => {
  excludedSites = normalizeExcludedSites(sites)
  renderExcludedSites()
  await chrome.storage.local.set({ excludedSites })
}

const addExcludedSite = async (value) => {
  const site = normalizeSiteHost(value)
  if (!site) {
    setExcludedSiteError(true)
    return
  }

  setExcludedSiteError(false)
  excludedSiteInput.value = ''
  await saveExcludedSites([...excludedSites, site])
}

const removeExcludedSite = async (site) => {
  await saveExcludedSites(excludedSites.filter((item) => item !== site))
}

const excludeCurrentSite = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await addExcludedSite(tab?.url || '')
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

  applyCurrentUiLanguage()
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
    extensionEnabled: extensionEnabledInput.checked,
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
  const uiLanguageMode = getUiLanguageMode(uiLanguageSelect.value)
  uiLanguageSelect.value = uiLanguageMode
  applyCurrentUiLanguage()
  await chrome.storage.local.set({ uiLanguage: uiLanguageMode })
}

const saveExtensionEnabled = async () => {
  applyCurrentUiLanguage()
  await saveToStorage()
}

const loadFromStorage = async () => {
  try {
    const storage = await chrome.storage.local.get([
      'configuration',
      'extensionEnabled',
      'excludedSites',
      'timezone',
      'locale',
      'languages',
      'ipCheckIntervalSeconds',
      'lat',
      'lon',
      'uiLanguage',
      // 'useDebuggerApi',
    ])

    configurationSelect.value = storage.configuration || 'browserDefault'
    extensionEnabledInput.checked = storage.extensionEnabled !== false
    excludedSites = normalizeExcludedSites(storage.excludedSites)
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
    uiLanguageSelect.value = getUiLanguageMode(storage.uiLanguage)
    applyCurrentUiLanguage()
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
  applyCurrentUiLanguage()
  debouncedSaveToStorage()
}

reloadButton.addEventListener('click', () => chrome.tabs.reload())
infoButton.addEventListener('click', () =>
  chrome.tabs.create({ url: 'html/info.html' })
)
uiLanguageSelect.addEventListener('change', saveUiLanguage)
extensionEnabledInput.addEventListener('change', saveExtensionEnabled)
addExcludedSiteButton.addEventListener('click', () =>
  addExcludedSite(excludedSiteInput.value)
)
excludeCurrentSiteButton.addEventListener('click', excludeCurrentSite)
excludedSiteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    addExcludedSite(excludedSiteInput.value)
  }
})
configurationSelect.addEventListener('change', handleConfigurationChange)
timeZoneInput.addEventListener('input', handleInputChange)
localeInput.addEventListener('input', handleInputChange)
languagesInput.addEventListener('input', handleInputChange)
ipCheckIntervalInput.addEventListener('input', debouncedSaveToStorage)
latitudeInput.addEventListener('input', handleInputChange)
longitudeInput.addEventListener('input', handleInputChange)
// debuggerApiModeCheckbox.addEventListener('change', saveToStorage)

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return

  if (changes.extensionEnabled) {
    extensionEnabledInput.checked = changes.extensionEnabled.newValue !== false
  }

  if (changes.uiLanguage) {
    uiLanguageSelect.value = getUiLanguageMode(changes.uiLanguage.newValue)
  }

  if (changes.excludedSites) {
    excludedSites = normalizeExcludedSites(changes.excludedSites.newValue)
    renderExcludedSites()
  }

  if (changes.timezone && configurationSelect.value === 'ipAddress') {
    timeZoneInput.value = changes.timezone.newValue || ''
  }

  if (changes.extensionEnabled || changes.uiLanguage || changes.timezone) {
    applyCurrentUiLanguage()
  }
})

await loadFromStorage()

if (extensionEnabledInput.checked) {
  if (configurationSelect.value === 'ipAddress') {
    await handleConfigurationChange()
  } else {
    refreshIpProfile().catch((error) => console.error(error.message))
  }
}
