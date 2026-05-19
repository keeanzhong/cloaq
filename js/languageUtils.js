const normalizeLanguageTag = (tag) => {
  if (!tag || typeof tag !== 'string') return null

  const cleanTag = tag.trim().split(';')[0].replace(/_/g, '-')
  if (!cleanTag) return null

  return cleanTag
    .split('-')
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) return part.toLowerCase()
      if (part.length === 4) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      }
      if (part.length === 2 || part.length === 3) return part.toUpperCase()
      return part
    })
    .join('-')
}

const dedupe = (values) => {
  const seen = new Set()
  return values.filter((value) => {
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

const getBaseLanguage = (locale) => {
  const normalized = normalizeLanguageTag(locale)
  return normalized ? normalized.split('-')[0] : null
}

const parseLanguageList = (value) => {
  if (Array.isArray(value)) {
    return dedupe(value.map(normalizeLanguageTag))
  }

  if (!value || typeof value !== 'string') return []

  return dedupe(value.split(',').map(normalizeLanguageTag))
}

const buildLanguageList = (locale, providerLanguages = []) => {
  const normalizedLocale = normalizeLanguageTag(locale)
  const baseLanguage = getBaseLanguage(normalizedLocale)
  const normalizedProviderLanguages = parseLanguageList(providerLanguages)

  return dedupe([
    normalizedLocale,
    ...normalizedProviderLanguages,
    baseLanguage,
  ])
}

const formatLanguageList = (languages) => parseLanguageList(languages).join(',')

const buildAcceptLanguageHeader = (languages) =>
  parseLanguageList(languages)
    .map((language, index) => {
      if (index === 0) return language
      const q = Math.max(1 - index * 0.1, 0.5).toFixed(1)
      return `${language};q=${q}`
    })
    .join(',')

export {
  buildAcceptLanguageHeader,
  buildLanguageList,
  formatLanguageList,
  parseLanguageList,
}
