const IP_LOOKUP_TIMEOUT_MS = 4500

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const withTimeout = async (url) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

const providers = [
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    normalize: (data) => {
      if (data.error) {
        throw new Error(data.reason || 'ipapi.co returned an error')
      }

      return {
        source: 'ipapi.co',
        ip: data.ip || null,
        countryCode: data.country_code || null,
        timezone: data.timezone || null,
        lat: toFiniteNumber(data.latitude),
        lon: toFiniteNumber(data.longitude),
        languages: data.languages || '',
      }
    },
  },
  {
    name: 'ip-api.com',
    url:
      'http://ip-api.com/json?fields=status,message,countryCode,lat,lon,timezone,query',
    normalize: (data) => {
      if (data.status !== 'success') {
        throw new Error(data.message || 'ip-api.com returned an error')
      }

      return {
        source: 'ip-api.com',
        ip: data.query || null,
        countryCode: data.countryCode || null,
        timezone: data.timezone || null,
        lat: toFiniteNumber(data.lat),
        lon: toFiniteNumber(data.lon),
        languages: '',
      }
    },
  },
]

const isCompleteIpProfile = (profile) =>
  profile?.timezone &&
  profile?.countryCode &&
  Number.isFinite(profile.lat) &&
  Number.isFinite(profile.lon)

const fetchIpProfile = async () => {
  const failures = []

  for (const provider of providers) {
    try {
      const profile = provider.normalize(await withTimeout(provider.url))
      if (isCompleteIpProfile(profile)) return profile

      failures.push(`${provider.name}: incomplete response`)
    } catch (error) {
      failures.push(`${provider.name}: ${error.message}`)
    }
  }

  throw new Error(`Failed to match IP address. ${failures.join(' | ')}`)
}

export { fetchIpProfile }
