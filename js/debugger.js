import {
  buildAcceptLanguageHeader,
  parseLanguageList,
} from './languageUtils.js'

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const sendCommand = (tabId, command, params = {}, callback = null) => {
  chrome.debugger.sendCommand({ tabId }, command, params, () => {
    if (chrome.runtime.lastError) {
      console.warn(`${command} failed: ${chrome.runtime.lastError.message}`)
      callback?.(false)
      return
    }

    callback?.(true)
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

const attachDebugger = (tabId, timezone, locale, lat, lon, languages) => {
  const latitude = toFiniteNumber(lat)
  const longitude = toFiniteNumber(lon)
  const hasCoordinates = latitude !== null && longitude !== null
  const hasLanguageOverrides = parseLanguageList(languages).length > 0

  if (timezone || locale || hasCoordinates || hasLanguageOverrides) {
    chrome.debugger.attach({ tabId: tabId }, '1.3', () => {
      if (!chrome.runtime.lastError) {
        if (timezone) {
          chrome.debugger.sendCommand(
            { tabId: tabId },
            'Emulation.setTimezoneOverride',
            {
              timezoneId: timezone,
            },
            () => {
              if (
                chrome.runtime.lastError &&
                chrome.runtime.lastError.message?.includes(
                  'Timezone override is already in effect'
                )
              ) {
                chrome.debugger.detach({ tabId })
              }
            }
          )
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
    })
  }
}

const detachDebugger = () => {
  chrome.debugger.getTargets((tabs) => {
    for (const tab in tabs) {
      if (tabs[tab].attached && tabs[tab].tabId) {
        chrome.debugger.sendCommand(
          { tabId: tabs[tab].tabId },
          'Emulation.clearGeolocationOverride',
          {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          }
        )
        chrome.debugger.detach({ tabId: tabs[tab].tabId })
      }
    }
  })
}

export { attachDebugger, detachDebugger }
