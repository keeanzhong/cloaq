const normalizeSiteHost = (value) => {
  const input = String(value || '').trim()
  if (!input) return null

  const withoutWildcard = input.replace(
    /^([a-z][a-z\d+.-]*:\/\/)?\*\./i,
    '$1'
  )
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(withoutWildcard)
    ? withoutWildcard
    : `https://${withoutWildcard}`

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const hostname = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '')

    return hostname || null
  } catch (error) {
    return null
  }
}

const normalizeExcludedSites = (sites = []) => {
  const values = Array.isArray(sites) ? sites : []
  return [...new Set(values.map(normalizeSiteHost).filter(Boolean))].sort()
}

const isUrlExcluded = (url, excludedSites = []) => {
  const hostname = normalizeSiteHost(url)
  if (!hostname) return false

  return normalizeExcludedSites(excludedSites).some(
    (site) => hostname === site || hostname.endsWith(`.${site}`)
  )
}

export { isUrlExcluded, normalizeExcludedSites, normalizeSiteHost }
