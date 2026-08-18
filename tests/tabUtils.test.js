import assert from 'node:assert/strict'
import test from 'node:test'

import { getUpdatedTabUrl, isConfigurableUrl } from '../js/tabUtils.js'

test('accepts web and local file pages', () => {
  assert.equal(isConfigurableUrl('https://example.com/path'), true)
  assert.equal(isConfigurableUrl('http://example.com'), true)
  assert.equal(isConfigurableUrl('file:///C:/example.html'), true)
})

test('rejects unknown and restricted browser pages', () => {
  assert.equal(isConfigurableUrl(''), false)
  assert.equal(isConfigurableUrl('   '), false)
  assert.equal(isConfigurableUrl('chrome://extensions/'), false)
  assert.equal(isConfigurableUrl('edge://extensions/'), false)
  assert.equal(isConfigurableUrl('chrome-extension://example/popup.html'), false)
  assert.equal(isConfigurableUrl('about:blank'), false)
  assert.equal(isConfigurableUrl('not a url'), false)
})

test('prefers a newly reported URL over the previous tab URL', () => {
  assert.equal(
    getUpdatedTabUrl(
      { url: 'chrome://extensions/' },
      { url: 'https://example.com/' }
    ),
    'chrome://extensions/'
  )
  assert.equal(
    getUpdatedTabUrl({ status: 'loading' }, { url: 'https://example.com/' }),
    'https://example.com/'
  )
})
