import {
  applyTranslations,
  getUiLanguageMode,
  resolveUiLanguage,
} from './i18n.js'

const applyStoredUiLanguage = async () => {
  const storage = await chrome.storage.local.get([
    'uiLanguage',
    'extensionEnabled',
    'configuration',
    'timezone',
  ])
  const uiLanguageMode = getUiLanguageMode(storage.uiLanguage)
  const useConfiguredTimeZone =
    storage.extensionEnabled !== false &&
    storage.configuration !== 'browserDefault'
  const uiLanguage = resolveUiLanguage(
    uiLanguageMode,
    useConfiguredTimeZone ? storage.timezone : ''
  )

  applyTranslations(uiLanguage)
}

await applyStoredUiLanguage()

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  if (
    changes.uiLanguage ||
    changes.extensionEnabled ||
    changes.configuration ||
    changes.timezone
  ) {
    applyStoredUiLanguage().catch((error) => console.error(error.message))
  }
})
