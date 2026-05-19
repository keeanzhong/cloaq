import {
  buildAcceptLanguageHeader,
  parseLanguageList,
} from './languageUtils.js'

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const sendCommand = (tabId, command, params = {}, callback = null) => {
  chrome.debugger.sendCommand({ tabId }, command, params, (result) => {
    if (chrome.runtime.lastError) {
      console.warn(`${command} failed: ${chrome.runtime.lastError.message}`)
      callback?.(false, null)
      return
    }

    callback?.(true, result)
  })
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

const applyLanguageOverrides = (tabId, languages) => {
  const languageList = parseLanguageList(languages)
  if (!languageList.length) return

  sendCommand(tabId, 'Network.enable', {}, (enabled) => {
    if (!enabled) return

    sendCommand(tabId, 'Network.setExtraHTTPHeaders', {
      headers: {
        'Accept-Language': buildAcceptLanguageHeader(languageList),
      },
    })
  })

  const languageScript = buildNavigatorLanguageScript(languageList)
  sendCommand(
    tabId,
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: languageScript,
      runImmediately: true,
    },
    (added) => {
      if (!added) {
        sendCommand(tabId, 'Page.addScriptToEvaluateOnNewDocument', {
          source: languageScript,
        })
      }
    }
  )
}

const applyDebuggerOverrides = (tabId, timezone, locale, lat, lon, languages) => {
  const latitude = toFiniteNumber(lat)
  const longitude = toFiniteNumber(lon)
  const hasCoordinates = latitude !== null && longitude !== null

  if (timezone) {
    sendCommand(tabId, 'Emulation.setTimezoneOverride', {
      timezoneId: timezone,
    })
  }

  if (hasCoordinates) {
    sendCommand(tabId, 'Emulation.setGeolocationOverride', {
      latitude,
      longitude,
      accuracy: 1,
    })
  }

  if (locale) {
    sendCommand(tabId, 'Emulation.setLocaleOverride', {
      locale,
    })
  }

  applyLanguageOverrides(tabId, languages)
}

const attachDebugger = (tabId, timezone, locale, lat, lon, languages) => {
  if (!hasDebuggerConfiguration(timezone, locale, lat, lon, languages)) return

  chrome.debugger.attach({ tabId }, '1.3', () => {
    if (chrome.runtime.lastError) {
      const message = chrome.runtime.lastError.message || ''
      if (message.toLowerCase().includes('already attached')) {
        applyDebuggerOverrides(tabId, timezone, locale, lat, lon, languages)
      } else {
        console.warn(`Debugger attach failed: ${message}`)
      }
      return
    }

    applyDebuggerOverrides(tabId, timezone, locale, lat, lon, languages)
  })
}

const detachDebuggerForTab = (tabId) => {
  chrome.debugger.sendCommand(
    { tabId },
    'Emulation.clearGeolocationOverride',
    {},
    () => chrome.debugger.detach({ tabId }, () => {})
  )
}

const detachDebugger = () => {
  chrome.debugger.getTargets((tabs) => {
    for (const tab in tabs) {
      if (tabs[tab].attached && tabs[tab].tabId) {
        detachDebuggerForTab(tabs[tab].tabId)
      }
    }
  })
}

export { attachDebugger, detachDebugger, detachDebuggerForTab }
