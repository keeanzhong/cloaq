import assert from 'node:assert/strict'
import test from 'node:test'

const debuggerCalls = []
const warnings = []
let attachedTabIds = new Set()
let nextErrors = new Map()
let lastErrorValue = null
let lastErrorWasRead = false

const completeCallback = (key, callback, result) => {
  lastErrorValue = nextErrors.get(key) || null
  lastErrorWasRead = false
  nextErrors.delete(key)
  callback(result)

  if (lastErrorValue) {
    assert.equal(lastErrorWasRead, true, `${key} must consume runtime.lastError`)
  }

  const hadError = Boolean(lastErrorValue)
  lastErrorValue = null
  return hadError
}

globalThis.chrome = {
  runtime: {},
  debugger: {
    attach(target, version, callback) {
      debuggerCalls.push(['attach', target.tabId, version])
      if (!completeCallback('attach', callback)) {
        attachedTabIds.add(target.tabId)
      }
    },
    detach(target, callback) {
      debuggerCalls.push(['detach', target.tabId])
      attachedTabIds.delete(target.tabId)
      completeCallback('detach', callback)
    },
    getTargets(callback) {
      debuggerCalls.push(['getTargets'])
      const targets = [...attachedTabIds].map((tabId) => ({
        attached: true,
        tabId,
      }))
      completeCallback('getTargets', callback, targets)
    },
    sendCommand(target, command, params, callback) {
      debuggerCalls.push(['sendCommand', target.tabId, command, params])
      completeCallback(`sendCommand:${command}`, callback, {})
    },
  },
}

Object.defineProperty(chrome.runtime, 'lastError', {
  configurable: true,
  get() {
    lastErrorWasRead = true
    return lastErrorValue
  },
})

const originalWarn = console.warn
console.warn = (...args) => warnings.push(args.join(' '))

const { attachDebugger, detachDebuggerForTab } = await import(
  '../js/debugger.js'
)

const reset = () => {
  debuggerCalls.length = 0
  warnings.length = 0
  attachedTabIds = new Set()
  nextErrors = new Map()
  lastErrorValue = null
  lastErrorWasRead = false
}

test.after(() => {
  console.warn = originalWarn
})

test('applies configured overrides after one debugger attachment', async () => {
  reset()

  const applied = await attachDebugger(
    101,
    'America/Los_Angeles',
    'en-US',
    45.5,
    -122.6,
    'en-US,en'
  )

  assert.equal(applied, true)
  assert.equal(
    debuggerCalls.filter(([name]) => name === 'attach').length,
    1
  )
  assert.deepEqual(
    debuggerCalls
      .filter(([name]) => name === 'sendCommand')
      .map(([, , command]) => command),
    [
      'Emulation.setTimezoneOverride',
      'Emulation.setGeolocationOverride',
      'Emulation.setLocaleOverride',
      'Network.enable',
      'Network.setExtraHTTPHeaders',
      'Page.addScriptToEvaluateOnNewDocument',
    ]
  )
  assert.deepEqual(warnings, [])
})

test('consumes a tab-removal error and stops remaining commands', async () => {
  reset()
  nextErrors.set('sendCommand:Emulation.setTimezoneOverride', {
    message: 'No tab with given id 101.',
  })

  const applied = await attachDebugger(
    101,
    'America/Los_Angeles',
    'en-US',
    45.5,
    -122.6,
    'en-US,en'
  )

  assert.equal(applied, false)
  assert.equal(
    debuggerCalls.filter(([name]) => name === 'sendCommand').length,
    1
  )
  assert.deepEqual(warnings, [])
})

test('consumes a restricted-target attachment error', async () => {
  reset()
  nextErrors.set('attach', { message: 'Cannot attach to this target.' })

  const applied = await attachDebugger(
    151,
    'America/Los_Angeles',
    'en-US',
    45.5,
    -122.6,
    'en-US,en'
  )

  assert.equal(applied, false)
  assert.equal(
    debuggerCalls.some(([name]) => name === 'sendCommand'),
    false
  )
  assert.deepEqual(warnings, [])
})

test('does not detach a tab that has no attached debugger', async () => {
  reset()

  const detached = await detachDebuggerForTab(202)

  assert.equal(detached, true)
  assert.equal(
    debuggerCalls.some(([name]) => name === 'detach'),
    false
  )
  assert.equal(
    debuggerCalls.some(([name]) => name === 'sendCommand'),
    false
  )
})

test('consumes expected errors when Chrome auto-detaches a tab', async () => {
  reset()
  attachedTabIds.add(303)
  nextErrors.set('sendCommand:Emulation.clearGeolocationOverride', {
    message: 'Debugger is not attached to the tab with id: 303.',
  })
  nextErrors.set('detach', {
    message: 'Debugger is not attached to the tab with id: 303.',
  })

  const detached = await detachDebuggerForTab(303)

  assert.equal(detached, true)
  assert.deepEqual(warnings, [])
})

test('serializes attach then detach operations for the same tab', async () => {
  reset()

  const attaching = attachDebugger(
    404,
    'America/Los_Angeles',
    'en-US',
    45.5,
    -122.6,
    'en-US,en'
  )
  const detaching = detachDebuggerForTab(404)

  await Promise.all([attaching, detaching])

  const attachIndex = debuggerCalls.findIndex(([name]) => name === 'attach')
  const detachIndex = debuggerCalls.findIndex(([name]) => name === 'detach')
  assert.ok(attachIndex >= 0)
  assert.ok(detachIndex > attachIndex)
  assert.equal(attachedTabIds.has(404), false)
})
