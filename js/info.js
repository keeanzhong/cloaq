import {
  applyTranslations,
  detectUiLanguage,
  getSupportedUiLanguage,
} from './i18n.js'

const storage = await chrome.storage.local.get(['uiLanguage'])
const uiLanguage = getSupportedUiLanguage(
  storage.uiLanguage || detectUiLanguage()
)

applyTranslations(uiLanguage)
