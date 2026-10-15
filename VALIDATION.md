# MVP 验证记录

验证日期：2026-10-14；2026-10-15 核对公开发行结果。Windows 实测环境为 x64、Node24.15.0、Electron42、pnpm11.25.0；CI 使用锁定的 pnpm11.0.8。当前版本0.2.0；保留前一日0.1的安装/宿主基线记录。

公开源码与下载：[GitHub 仓库](https://github.com/lueyaoGeng/extrafriendly-cat)、[0.2.0 试用版](https://github.com/lueyaoGeng/extrafriendly-cat/releases/tag/v0.2.0)。发布于2026-10-14，固定构建源为 `6ee0d8bc5f94b22c891bffa867e4eeb9c1792f45`；后续文档提交不改变该版本的源码标签或安装包。

## 已通过

- 客户端 TypeScript 检查、主进程与 React 渲染器构建；文档静态构建。
- [三平台 CI](https://github.com/lueyaoGeng/extrafriendly-cat/actions/runs/38522608465)全部通过：Windows x64、macOS Intel、macOS Apple Silicon。每个平台完成私密文件排除、冻结依赖安装、猫模块与网关行为测试、桌面完整行为/合同/构建资源检查、专辑与外观完整性检查，以及对应平台打包。
- 猫模块27项行为测试：照料独立冻结、隐藏/离线不追扣、关闭功能阻止调用、每日专辑稳定、免费错误不切个人 API、异步回复/窗口清理、首次/升级 API 引导、低额度跨重启去重、耗尽升级提醒、关闭提醒、分钟限流与过期额度、官方链接白名单、错误提示的原生单行合同。
- 网关22项行为测试：实际 SQLite 和本地 HTTP、并发额度、UTC 跨日、持久化重启、字节上限、中文客户端数据兼容、错误/超时与不退款预算、按实际限额的20%提示、固定免费模型、未确认配置停止调用、错误响应不泄露 Key、不信任伪造代理 IP。
- 0.1已通过14组相关宿主测试；0.2针对改动再次通过 AI gateway、Provider service、外观和打包合同4组。新的参数回归验证 GLM-4.7-Flash 禁用思考后产生可见短回复，使用测试服务返回值。非 Linux 上不运行需要 rpmbuild 的 RPM 工具夹具。
- 20张专辑的来源/评分/音乐搜索链接数据，以及三张透明原生 V2 动作图的完整解码验证。
- 实际 Windows 开发客户端和0.2独立包：首次 API 引导、照料、开关、专辑、动画、真实 Open-Meteo 天气与原生换猫；用户提供的 Key 调用智谱 `glm-4-flash-250414` HTTP200，模型回复显示在原生气泡。宿主确认 OS 加密可用，密钥和 Provider 配置文件均不含明文 Key。
- 正常用户数据路径中的免费个人 API 已保存并启用。该配置仅在这台电脑，其他用户不会从安装包获得它。实测 GLM-4.7-Flash 返回模型繁忙（1305），因此本版推荐并固定已成功的 GLM-4-Flash-250414；不切到付费模型。
- 本机 Node HTTP 网关 → 智谱真实调用 HTTP200，成功返回回复和19次设备剩余额度，响应不含 Key。不是公开地址部署。
- Windows原生额度 UI 夹具通过5个场景：低额度按钮打开指南、同周期不重复、开关关闭后静默、耗尽再提醒、分钟限流仅稍等。这些是合成网关响应，未冒称线上额度实测。
- 公开的 Windows NSIS 0.2安装包从成功的 CI 下载后，已静默安装到隔离目录，并对实际安装的 exe 完成原生交互和真实免费模型聊天。安装与卸载退出码均为0，已有本机加密配置保留。记录在 `artifacts/ci-38522608465/windows-validation.json`；0.1基线仍保留。真实 Cloudflare推理、macOS实体机测试均未执行。
- 0.2实际打包资源合同通过；对上述 CI 安装包解出的14,363个发布资源文件扫描，确认不含本机 Key、`apikeys/`、密钥库或个人 Provider 配置。Git忽略密钥目录。公开的 `ExtrafriendlyCat-0.2.0-win-x64-setup.exe` 为190,459,354字节，SHA-256为 `954d1449a3dbfa5b55c68d4ec42460ffe2fe58106d3fcdacea46d8a4352c72a9`，与 GitHub 发布资产摘要一致；Authenticode状态NotSigned。
- [发行工作流](https://github.com/lueyaoGeng/extrafriendly-cat/actions/runs/38525611764)核对成功的 CI 与相同源提交后，先向草稿上传5个安装包和 `SHA256SUMS.txt`，全部成功才公开为预发行版本。macOS Intel/Apple Silicon 各提供 ZIP、DMG；包仅作 ad-hoc 签名，未公证。

## 实测修复

面板脚本/样式必须包含在声明的 HTML 中，否则安装快照缺失它们；宿主面板回调必须保持同一个对象引用，否则用户开关消息丢失。动画状态进入渲染缓存键，确保点击开关即时生效。SDK一分钟照料用可取消的单次调度重排。聊天与网关统一 UTF-8 上限，避免中文请求误判。

本机 EFS 加密 AppData 中的文件/目录重命名实际报 EXDEV。Windows 改用用户 home/.extrafriendly-cat，通过原子重命名探针和独立程序实测；不修改系统加密设置，个人密钥仍使用 OS safeStorage。

额度耗尽/模型错误会产生静态气泡，必须是单行；将软件提示附到错误回复时原生宿主拒绝换行，已由真实UI复现、修复，并补429/503回归。短标签「设置」「API」避免四个按钮时文字截断。

## 完成边界

本机 `pnpm --filter @open-pets/desktop check` 曾被 Claude-memory 符号链接夹具的 EPERM 中断；本机相关14组测试独立通过，记录保存在 `artifacts/desktop-focused-tests.json`。之后 Windows 与两种 macOS 架构的 CI 均完成整套桌面检查，没有以本机权限问题跳过平台测试。

上游插件目录发布脚本依赖本 checkout 未提供的 web/scripts/sync-plugins.js 和 web/public/plugins/catalog.v2.json，因此插件目录发布验证不能完成。该 MVP 仅随客户端内置猫模块，已用真实宿主、SDK行为测试及桌面打包资源合同验证，未发布上游目录。

Cloudflare Worker 配置曾通过 Wrangler4.149.0 deploy --dry-run；这不代表真实推理、中文文风、大陆连通性或免费计费已经验证。当前共享免费地址为空。macOS Intel/Apple Silicon 安装包已通过 CI 并作为预览包发布，实体机交互验收仍未完成。

Windows 试用安装包未签名，macOS 包未公证。系统休眠/多显示器/不同缩放的长期交互、macOS鼠标穿透与签名公证、公开共享服务的大陆连通性和跨日长时间试用继续作为正式发行前事项。

可重跑 Windows 交互脚本：`node scripts/friendly-windows-smoke.mjs`；独立包使用 `--packaged`，并可用 `--executable` 指定实际安装的 exe。追加 `--live-bigmodel` 私下读取忽略的本机 Key、保存到宿主加密配置并验证真实聊天；没有该选项时明确使用模拟或未上线服务，不输出密钥。截图和结果在 `artifacts/windows-smoke` 与 `artifacts/windows-packaged-smoke`。

额度 UI：`node scripts/friendly-quota-smoke.mjs`；真实网关：`node scripts/verify-live-gateway.mjs`；打包后私密文件/本机 Key 排除检查：`node scripts/check-friendly-cat-package.mjs --check-local-key`，可用 `--resources-dir` 和 `--installer` 指定 CI 安装产物。证据分别在 `artifacts/windows-quota-smoke/result.json`、`artifacts/live-gateway.json` 和 `artifacts/package-verification.json`。这些脚本不替代公网部署与 Mac实机测试。

公开源码前已运行 `node scripts/check-friendly-cat-source.mjs --check-local-key`，检查 Git文件集合没有密钥目录、本机配置或本机 Key；CI 不带 Key，仅检查私密文件排除。源码上传与 Release 二进制发布分开，跨平台构建验证通过后才公开安装包。

GitHub推送保护发现上游历史含Google OAuth常量；没有绕过保护。公开仓库采用清理后的独立初始快照，保留MIT许可、原README和固定基线引用。未打包的Calendar Airmail示例已移除硬编码OAuth值。原始上游历史和开发分支仅保留在本机，不推送到公开仓库。

CI扩展检查发现并修复Windows开发快照清理的路径分隔符问题，以及团队注册在截止时刻收到可重试响应却返回原始409的边界问题；后者用受控时钟复现，28项团队行为测试通过。测试夹具改为本产品的默认猫模块，Codex外观导入隔离主目录，CI临时目录使用完整规范路径。删除只断言手写示例、未调用真实代码的旧Cursor检查；保留实际安装/读取/卸载的`agent-setup-cursor`行为测试。
