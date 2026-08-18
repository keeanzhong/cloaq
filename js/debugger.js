import {
  buildAcceptLanguageHeader,
  parseLanguageList,
} from './languageUtils.js'

const DEBUGGER_PROTOCOL_VERSION = '1.3'
const tabOperationQueues = new Map()

const EXPECTED_LIFECYCLE_ERRORS = [
  /cannot access a (chrome|edge)(-extension)?:\/\/ url/i,
  /cannot access contents of url/i,
  /cannot attach to this target/i,
  /debugger is not attached/i,
  /no tab with given id/i,
  /no target with given id/i,
  /target closed/i,
]

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const isExpectedLifecycleError = (message = '') =>
  EXPECTED_LIFECYCLE_ERRORS.some((pattern) => pattern.test(message))

const reportDebuggerError = (label, message) => {
  if (message && !isExpectedLifecycleError(message)) {
    console.warn(`${label} failed: ${message}`)
  }
}

const invokeDebuggerApi = (label, invoke) =>
  new Promise((resolve) => {
    try {
      invoke((result) => {
        const runtimeError = chrome.runtime.lastError
        const message = runtimeError?.message || ''

        if (message) {
          reportDebuggerError(label, message)
          resolve({ error: message, ok: false, result: null })
          return
        }

        resolve({ error: '', ok: true, result })
      })
    } catch (error) {
      const message = error?.message || String(error)
      reportDebuggerError(label, message)
      resolve({ error: message, ok: false, result: null })
    }
  })

const sendCommand = (tabId, command, params = {}) =>
  invokeDebuggerApi(command, (callback) =>
    chrome.debugger.sendCommand({ tabId }, command, params, callback)
  )

const getDebuggerTargets = async () => {
  const response = await invokeDebuggerApi('Debugger target lookup', (callback) =>
    chrome.debugger.getTargets(callback)
  )

  return response.ok && Array.isArray(response.result) ? response.result : []
}

const attachDebuggerTarget = (tabId) =>
  invokeDebuggerApi('Debugger attach', (callback) =>
    chrome.debugger.attach(
      { tabId },
      DEBUGGER_PROTOCOL_VERSION,
      callback
    )
  )

const detachDebuggerTarget = (tabId) =>
  invokeDebuggerApi('Debugger detach', (callback) =>
    chrome.debugger.detach({ tabId }, callback)
  )

const queueTabOperation = (tabId, operation) => {
  const previous = tabOperationQueues.get(tabId) || Promise.resolve()
  const current = previous
    .catch(() => false)
    .then(operation)
    .catch((error) => {
      reportDebuggerError('Debugger operation', error?.message || String(error))
      return false
    })

  tabOperationQueues.set(tabId, current)
  void current.finally(() => {
    if (tabOperationQueues.get(tabId) === current) {
      tabOperationQueues.delete(tabId)
    }
  })

  return current
}

const buildNavigatorLanguageScript = (languages) => `
;(() => {
  const languages = ${JSON.stringify(languages)};
  const primaryLanguage = languages[0] || '';

  const defineNavigatorValue = (target, property, valueFactory) => {
    try {
      Object.defineProperty(target, property, {
        configurable: true,
        get: valueFactory,
      });
    } catch (error) {}
  };

  const defineAll = (target) => {
    if (!target) return;
    defineNavigatorValue(target, 'language', () => primaryLanguage);
    defineNavigatorValue(target, 'languages', () => languages.slice());
  };

  defineAll(window.navigator);
  defineAll(Navigator.prototype);
})();
`

const hasDebuggerConfiguration = (timezone, locale, lat, lon, languages) => {
  const latitude = toFiniteNumber(lat)
  const longitude = toFiniteNumber(lon)

  return Boolean(
    timezone ||
      locale ||
      parseLanguageList(languages).length ||
      (latitude !== null && longitude !== null)
  )
}

const applyLanguageOverrides = async (tabId, languages) => {
  const languageList = parseLanguageList(languages)
  if (!languageList.length) return true

  const networkEnabled = await sendCommand(tabId, 'Network.enable')
  if (
    !networkEnabled.ok &&
    isExpectedLifecycleError(networkEnabled.error)
  ) {
    return false
  }

  if (networkEnabled.ok) {
    const headersApplied = await sendCommand(
      tabId,
      'Network.setExtraHTTPHeaders',
      {
        headers: {
          'Accept-Language': buildAcceptLanguageHeader(languageList),
        },
      }
    )

    if (
      !headersApplied.ok &&
      isExpectedLifecycleError(headersApplied.error)
    ) {
      return false
    }
  }

  const languageScript = buildNavigatorLanguageScript(languageList)
  const scriptAdded = await sendCommand(
    tabId,
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: languageScript,
      runImmediately: true,
    }
  )

  if (scriptAdded.ok) return true
  if (isExpectedLifecycleError(scriptAdded.error)) return false

  const fallback = await sendCommand(
    tabId,
    'Page.addScriptToEvaluateOnNewDocument',
    { source: languageScript }
  )

  return fallback.ok
}

const applyDebuggerOverrides = async (
  tabId,
  timezone,
  locale,
  lat,
  lon,
  languages
) => {
  const latitude = toFiniteNumber(lat)
  const longitude = toFiniteNumber(lon)
  const hasCoordinates = latitude !== null && longitude !== null
  const commands = []

  if (timezone) {
    commands.push([
      'Emulation.setTimezoneOverride',
      { timezoneId: timezone },
    ])
  }

  if (hasCoordinates) {
    commands.push([
      'Emulation.setGeolocationOverride',
      { latitude, longitude, accuracy: 1 },
    ])
  }

  if (locale) {
    commands.push(['Emulation.setLocaleOverride', { locale }])
  }

  for (const [command, params] of commands) {
    const response = await sendCommand(tabId, command, params)
    if (!response.ok && isExpectedLifecycleError(response.error)) {
      return false
    }
  }

  return applyLanguageOverrides(tabId, languages)
}

const ensureDebuggerAttached = async (tabId) => {
  const targets = await getDebuggerTargets()
  const target = targets.find((candidate) => candidate.tabId === tabId)

  if (target?.attached) return true

  const response = await attachDebuggerTarget(tabId)
  return response.ok
}

const attachDebugger = (
  tabId,
  timezone,
  locale,
  lat,
  lon,
  languages
) => {
  if (!hasDebuggerConfiguration(timezone, locale, lat, lon, languages)) {
    return Promise.resolve(false)
  }

  return queueTabOperation(tabId, async () => {
    if (!(await ensureDebuggerAttached(tabId))) return false

    return applyDebuggerOverrides(
      tabId,
      timezone,
      locale,
      lat,
      lon,
      languages
    )
  })
}

const detachDebuggerForTab = (tabId) =>
  queueTabOperation(tabId, async () => {
    const targets = await getDebuggerTargets()
    const target = targets.find((candidate) => candidate.tabId === tabId)

    if (!target?.attached) return true

    await sendCommand(tabId, 'Emulation.clearGeolocationOverride')
    const response = await detachDebuggerTarget(tabId)
    return response.ok || isExpectedLifecycleError(response.error)
  })

const detachDebugger = async () => {
  const targets = await getDebuggerTargets()
  const tabIds = [
    ...new Set(
      targets
        .filter((target) => target.attached && target.tabId)
        .map((target) => target.tabId)
    ),
  ]

  await Promise.all(tabIds.map(detachDebuggerForTab))
}

export { attachDebugger, detachDebugger, detachDebuggerForTab }
