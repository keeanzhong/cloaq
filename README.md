# Cloaq 浏览器扩展

Cloaq 是一个浏览器扩展，用来伪装网页能读取到的时区、地理位置、区域格式和语言信息。这个 fork 在原版基础上增加了更可靠的 IP 自动匹配、中文界面切换，以及语言注入能力。

## 主要功能

- 自动匹配当前 IP：优先使用 `ipapi.co`，失败时回退到 `ip-api.com`。
- 自动填充时区、经纬度、区域格式和语言列表。
- 支持手动填写 `Time Zone`、`Locale`、`Languages`、纬度和经度。
- 支持 English / 简体中文界面切换。
- 通过 Chrome Debugger API 注入：
  - `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - `navigator.language`
  - `navigator.languages`
  - HTTP `Accept-Language`
  - Geolocation 经纬度

## 重要限制

Cloaq 不会改变你的真实 IP 地址。要改变 IP，需要使用 VPN 或代理。Cloaq 的作用是让浏览器暴露给网页的时区、语言、区域格式和地理位置尽量匹配你的出口 IP。

## 调试横幅说明

启用 Cloaq 后，Chrome/Edge 顶部可能出现类似：

> Cloaq - Location Guard & Locale Switcher 已开始调试此浏览器

这是浏览器在扩展使用 `chrome.debugger` API 时显示的安全提示。扩展本身不能在代码里关闭这个横幅，因为它是浏览器级别的安全提示。

可选处理方式：

1. 接受横幅，保留当前最强的浏览器级伪装效果。
2. 用启动参数隐藏调试提示：

   ```powershell
   chrome.exe --silent-debugger-extension-api
   ```

   或 Edge：

   ```powershell
   msedge.exe --silent-debugger-extension-api
   ```

   注意：这个参数是否完全生效取决于浏览器版本和启动方式。

3. 改成非 debugger 的脚本注入方案。这个方案可以避免调试横幅，但通常不如 Debugger API 稳定，页面初始加载、iframe、worker 和请求头覆盖能力都会变弱。

## 安装到 Chrome

1. 打开 `chrome://extensions/`。
2. 打开右上角 `Developer mode`。
3. 点击 `Load unpacked`。
4. 选择本项目目录，或选择构建后的 `build` 目录。
5. 点击扩展图标，选择 `Match IP Address` 或手动配置。

## 安装到 Edge

1. 打开 `edge://extensions/`。
2. 打开 `Developer mode`。
3. 点击 `Load unpacked`。
4. 选择本项目目录，或选择构建后的 `build` 目录。

Edge 也可能显示开发者模式或调试相关提示，这是浏览器安全策略的一部分。

## Firefox 支持

当前版本主要面向 Chromium 内核浏览器，例如 Chrome、Edge、Brave、Opera、Vivaldi。Firefox 的扩展 API 与 Chromium 不完全一致，尤其是 `chrome.debugger` 相关能力不同，因此不能保证直接可用。

要支持 Firefox，需要单独做兼容适配，通常包括：

- 替换或降级 Debugger API 相关能力。
- 调整 manifest 和权限。
- 使用 `about:debugging` 临时加载扩展进行测试。

## 构建

项目使用 JavaScript 和 Tailwind CSS。

安装依赖：

```bash
yarn
```

构建扩展：

```bash
yarn build
```

构建结果会输出到 `build` 目录。

## 本地测试

加载扩展后，选择 `Match IP Address`，刷新一个普通网页，然后在页面控制台检查：

```js
Intl.DateTimeFormat().resolvedOptions().timeZone
navigator.language
navigator.languages
```

如需检查请求头，可以打开开发者工具的 Network 面板，查看请求中的 `Accept-Language`。

## 仓库私密化

这个 fork 可以改成 private 私密仓库。使用 GitHub CLI：

```bash
gh repo edit keeanzhong/cloaq --visibility private --accept-visibility-change-consequences
```

私密仓库不会影响你本地加载扩展，但会影响别人访问仓库、fork 网络和公开展示。

## 权限说明

- `debugger`：用于通过 Chrome Debugger API 修改时区、地理位置、区域格式、语言和请求头。
- `webNavigation`：用于在页面导航时重新附加调试配置。
- `storage`：用于保存配置、界面语言和手动填写的参数。

## 许可证

本项目继承原项目的 GPL-3.0 许可证。
