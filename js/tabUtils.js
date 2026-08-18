const CONFIGURABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:'])

const isConfigurableUrl = (value = '') => {
  if (typeof value !== 'string' || !value.trim()) return false

  try {
    return CONFIGURABLE_PROTOCOLS.has(new URL(value).protocol)
  } catch (error) {
    return false
  }
}

const getUpdatedTabUrl = (changeInfo = {}, tab = {}) =>
  changeInfo.url || tab.url || ''

export { getUpdatedTabUrl, isConfigurableUrl }
