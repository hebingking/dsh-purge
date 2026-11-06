# DeepSeek Harness 0.2.2-rc.1 兼容适配

本分支由 **hebingking** 维护，源自 **HunYiSage/dsh-purge**：
https://github.com/HunYiSage/dsh-purge

基线为上游 `fc6e787dda5cfbc48c342cf427831b403239b866`，插件版本 1.1.92。
保留上游完整 Git 提交历史、作者署名、Apache-2.0 LICENSE 和 NOTICE。
这是第三方适配，不代表原作者、维护团队或 DeepSeek 官方提供支持。

## 安装

Web 版在 PowerShell 执行：

```powershell
dsh plugin --profile web add https://codeload.github.com/hebingking/dsh-purge/tar.gz/refs/heads/master
```

桌面 EXE 使用自己的 `desktop` profile。可在桌面插件管理界面使用同一压缩包地址安装；
如使用桌面自带的 dsh 命令行，应使用桌面版提供的命令入口与 `--profile desktop`，
不要把 Web profile 的完整配置覆盖到 desktop profile。
插件加载后应用补丁，按提示完整退出并重开 EXE。
官方 Electron 包需要从原有 app.asar 切换到插件解包后的 resources/app，
仅把插件目录复制过去并不能保证运行中的 EXE 已经加载补丁。

如果首次安装仍出现 `ERR_PNPM_IGNORED_BUILDS`，包可能已经下载成功，
但 postinstall 被包管理器拦截。进入对应的 profile 目录，执行：

```powershell
node node_modules/dsh-purge/scripts/ensure-profile-bundle.mjs
pnpm approve-builds
pnpm install
```

审批列表仅选择 dsh-purge。这一适配在 pnpm 11.21.0 验证，其他 pnpm 小版本未逐一验证。

## 代码改动

- #14：适配新的 `escalationDisplayReason(mode, justification)` 参数，保留显式拒绝与取消语义。
- #17：0.2.2 的 edit/delete 共享 `requirePresent()`；仅调整 edit，保留 delete 原有行为。
- #40：适配新的 SystemPrompt 返回结构，保留 provider tools、必需运行上下文及完整提示词。
- #54、#60、#62：适配移动后的交付物提示词、PTC 执行器与工具执行管线文件。
- #67：适配 Agent loop 的新缩进和缺省 messages。
- #74：保留组装前的准备钩子，以及新的模型选择、已解析工具集和参数顺序。
- #82：适配桌面主进程的新打包结构；缺少 DSH_PROFILE 时兜底 desktop，保留已配置的 profile。
- #92、#93：避免每次应用时重复插入桌面退出日志代码。
- pnpm：保留来源 URL 对应的 dsh-purge 构建审批，解决 pnpm 11.21.0 重启后反复丢失审批的问题。
- 安装及更新地址指向本复刻仓库，避免本分支更新时被上游未适配代码覆盖。

适配仅对识别为 `0.2.2-rc.1` 的宿主启用。未通过隐藏不匹配状态或强制标记已应用来消除报错。

## 验证记录（2026-11-06）

环境：Windows、Node.js 24.18.1、pnpm 11.21.0、DeepSeek Harness 0.2.2-rc.1。

- Web：实际服务与插件状态接口检查通过；界面 63 项已应用、2 项正常跳过，pending / drifted 均为 0。
- 桌面：文件应用与离线行为测试通过；68 项已应用、2 项正常跳过，pending / drifted 均为 0。
  58 个目标文件发生变更，其中 48 个 JavaScript 文件语法检查通过；重复应用不再产生变更。
  当前记录不把文件状态验证等同于重启后的 EXE 界面验证。
- 行为回归：显式拒绝/取消、文件删除原有约束、完整提示词中的工具与必需上下文、准备钩子调用顺序、
  缺省消息、桌面 profile 兜底和退出日志幂等性均通过。
- 没有执行付费模型对话。

仓库附带可独立执行的回归测试：

```sh
npm run test:compat
```

测试只使用临时目录和合成夹具，不修改用户实际安装。
实际宿主的状态仍应在安装并完整重启后检查；其他宿主版本、操作系统和更高版本插件没有在这里验证。
升级或重装上游插件可能覆盖兼容修复，升级前应保留备份。

## 正常跳过

- #71：未安装可选的梁神预设，找不到相应目标文件。
- #80：用于撤销旧版追加的极简模式 fs/web 工具；未发生过这些历史改动时无需处理。

两项均为环境无需执行，不是兼容失败。
