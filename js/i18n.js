const messages = {
  en: {
    uiLanguage: 'UI Language',
    autoUiLanguage: 'Follow Time Zone',
    extensionEnabled: 'Enable Cloaq',
    extensionEnabledDescription:
      "Off uses your browser's local environment without Cloaq overrides.",
    excludedSites: 'Excluded Sites',
    excludedSitePlaceholder: 'example.com',
    addSite: 'Add',
    excludeCurrentSite: 'Exclude Current Site',
    invalidExcludedSite: 'Enter a valid HTTP or HTTPS website.',
    noExcludedSites: 'No excluded sites.',
    removeExcludedSite: 'Remove excluded site',
    configuration: 'Configuration',
    browserDefault: 'Browser Default',
    custom: 'Custom',
    ipAddress: 'Match IP Address',
    locations: 'Locations',
    timeZone: 'Time Zone',
    locale: 'Locale',
    languages: 'Languages',
    languagesPlaceholder: 'en-US,en',
    ipCheckInterval: 'IP Check Interval',
    secondsUnit: 'seconds',
    latitude: 'Latitude',
    longitude: 'Longitude',
    rateUs: 'Star',
    contact: 'Issues',
    github: 'GitHub',
    reloadTitle: 'Reload current page',
    infoTitle: 'Info',
    startUsingTitle: 'Start Using Cloaq',
    startUsingStep1:
      "1. Pin the extension by opening your browser's extensions menu and selecting the thumbtack icon.",
    startUsingStep2: '2. Click the extension icon on your toolbar.',
    startUsingStep3: '3. Adjust the options to your desired values.',
    howWorksTitle: 'How Cloaq Works',
    howWorksText:
      'Cloaq uses the chrome.debugger API to change data directly at the browser level, making it effective across frames and web workers during the initial page load.',
    ipAddressTitle: 'IP Address',
    ipAddressText:
      'Cloaq does not change your IP address. To change your IP address you will need a VPN or proxy.',
    debuggingTitle: 'Hide Debugging Notification Bar',
    debuggingText:
      'While the extension is on, a notification bar becomes visible. Hiding the bar can be done by using the --silent-debugger-extension-api flag.',
    flagInstructions: 'Instructions on how to run Chrome with flags.',
  },
  'zh-CN': {
    uiLanguage: '界面语言',
    autoUiLanguage: '跟随当前时区',
    extensionEnabled: '启用 Cloaq',
    extensionEnabledDescription:
      '关闭后撤销 Cloaq 覆盖，网页跟随浏览器本地环境。',
    excludedSites: '排除网站',
    excludedSitePlaceholder: 'example.com',
    addSite: '添加',
    excludeCurrentSite: '排除当前网站',
    invalidExcludedSite: '请输入有效的 HTTP 或 HTTPS 网站。',
    noExcludedSites: '暂无排除的网站。',
    removeExcludedSite: '移除排除网站',
    configuration: '配置',
    browserDefault: '浏览器默认',
    custom: '自定义',
    ipAddress: '匹配 IP 地址',
    locations: '位置',
    timeZone: '时区',
    locale: '区域格式',
    languages: '语言',
    languagesPlaceholder: 'zh-CN,zh',
    ipCheckInterval: 'IP 检查间隔',
    secondsUnit: '秒',
    latitude: '纬度',
    longitude: '经度',
    rateUs: '点星',
    contact: '反馈',
    github: 'GitHub',
    reloadTitle: '重新加载当前页面',
    infoTitle: '说明',
    startUsingTitle: '开始使用 Cloaq',
    startUsingStep1: '1. 打开浏览器扩展菜单，点击图钉图标固定 Cloaq。',
    startUsingStep2: '2. 点击工具栏右上角的扩展图标。',
    startUsingStep3: '3. 按需要调整配置。',
    howWorksTitle: 'Cloaq 如何工作',
    howWorksText:
      'Cloaq 使用 chrome.debugger API 在浏览器层面修改数据，可在初始页面加载时覆盖 frame 和 web worker。',
    ipAddressTitle: 'IP 地址',
    ipAddressText:
      'Cloaq 不会改变你的真实 IP 地址。如需改变 IP，请使用 VPN 或代理。',
    debuggingTitle: '隐藏调试通知栏',
    debuggingText:
      '扩展启用时浏览器会显示调试通知栏。可通过 --silent-debugger-extension-api 启动参数隐藏它。',
    flagInstructions: '查看如何使用 Chrome 启动参数。',
  },
}

const defaultUiLanguage = 'en'
const autoUiLanguage = 'auto'
const chineseTimeZones = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Hong_Kong',
  'Asia/Macau',
  'Asia/Taipei',
])

const getSupportedUiLanguage = (language) =>
  Object.prototype.hasOwnProperty.call(messages, language)
    ? language
    : defaultUiLanguage

const getUiLanguageMode = (language) =>
  language === autoUiLanguage ||
  Object.prototype.hasOwnProperty.call(messages, language)
    ? language
    : autoUiLanguage

const detectUiLanguageFromTimeZone = (timeZone) => {
  let effectiveTimeZone = timeZone

  if (!effectiveTimeZone) {
    try {
      effectiveTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (error) {
      effectiveTimeZone = ''
    }
  }

  return chineseTimeZones.has(effectiveTimeZone)
    ? 'zh-CN'
    : defaultUiLanguage
}

const resolveUiLanguage = (mode, timeZone) =>
  mode === autoUiLanguage
    ? detectUiLanguageFromTimeZone(timeZone)
    : getSupportedUiLanguage(mode)

const translate = (language, key) =>
  messages[getSupportedUiLanguage(language)][key] || messages.en[key] || key

const applyTranslations = (language) => {
  const uiLanguage = getSupportedUiLanguage(language)
  document.documentElement.lang = uiLanguage

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = translate(uiLanguage, element.dataset.i18n)
  })

  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = translate(uiLanguage, element.dataset.i18nTitle)
  })

  document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
    element.alt = translate(uiLanguage, element.dataset.i18nAlt)
  })

  document.querySelectorAll('[data-i18n-label]').forEach((element) => {
    element.label = translate(uiLanguage, element.dataset.i18nLabel)
  })

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = translate(
      uiLanguage,
      element.dataset.i18nPlaceholder
    )
  })
}

const applyPopupTranslations = applyTranslations

export {
  applyTranslations,
  applyPopupTranslations,
  autoUiLanguage,
  defaultUiLanguage,
  detectUiLanguageFromTimeZone,
  getUiLanguageMode,
  getSupportedUiLanguage,
  resolveUiLanguage,
  translate,
}
