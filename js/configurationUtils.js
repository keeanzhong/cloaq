import countryLocales from './countryLocales.js'
import { buildLanguageList, formatLanguageList } from './languageUtils.js'

const getCountryLocale = (countryCode) =>
  countryLocales[countryCode] || countryLocales[countryCode?.toUpperCase()]

const buildLanguagesForLocale = (locale, providerLanguages = '') =>
  formatLanguageList(buildLanguageList(locale, providerLanguages))

const buildIpConfiguration = (ipProfile) => {
  if (!ipProfile) return null

  const locale =
    getCountryLocale(ipProfile.countryCode) ||
    buildLanguageList(null, ipProfile.languages)[0] ||
    ''

  return {
    timezone: ipProfile.timezone,
    locale,
    languages: buildLanguagesForLocale(locale, ipProfile.languages),
    lat: ipProfile.lat,
    lon: ipProfile.lon,
  }
}

const hasSpoofingConfiguration = (settings) =>
  Boolean(
    settings?.timezone ||
      settings?.locale ||
      settings?.languages ||
      Number.isFinite(Number(settings?.lat)) ||
      Number.isFinite(Number(settings?.lon))
  )

export {
  buildIpConfiguration,
  buildLanguagesForLocale,
  getCountryLocale,
  hasSpoofingConfiguration,
}
