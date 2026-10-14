# Extrafriendly Cat

一只属于你的桌面猫。温柔、稍微可爱，愿意陪你聊天，也能喂饭、铲屎、递来一张每日唱片。

![奶油猫](apps/desktop/assets/friendly-cats/friendly-cream/thumbnail.png)
![墨墨猫](apps/desktop/assets/friendly-cats/friendly-ink/thumbnail.png)
![三花猫](apps/desktop/assets/friendly-cats/friendly-calico/thumbnail.png)

基于 [OpenPets](https://github.com/OpenPetsHQ/openpets) 的 MIT 源码二次开发，保留来源说明与版权声明。[上游 README](UPSTREAM_README.md)记录原平台功能；本项目的使用方式以这份说明和[客户端指南](EXTRAFRIENDLY.md)为准。

## 下载与使用

从 [Releases](https://github.com/lueyaoGeng/extrafriendly-cat/releases) 下载 Windows x64 试用安装包。0.2.0 的 Windows 原生交互与真实免费模型聊天已在本机验证；安装包未签名。macOS Intel/Apple Silicon 提供构建流程，真实 Mac 交互尚未验收。

首次打开会显示「聊天与 API」引导，按官方步骤创建自己的免费 Key、配置文本模型，再主动选择个人 API。推荐 `glm-4-flash-250414`，地址 `https://open.bigmodel.cn/api/paas/v4`；模型价格和频率限制以智谱当前控制台为准。也可以跳过设置，先让猫陪着你。

统一共享聊天服务**尚未上线**。这个源码仓库和安装包不会包含作者的 API Key，别人的电脑也不会获得作者的额度。每位用户可以接入自己的免费 API；未来共享网关部署后，才由服务端提供统一额度。

右键猫猫或系统托盘打开「猫猫设置」。每项功能可以独立关闭，喂食、铲屎暂停或程序离线不会追扣数值，也没有好感、疾病、死亡惩罚。

## 已有功能

- 独立透明桌宠、原生头顶气泡、拖动与托盘入口。
- 三种原创猫，支持导入标准 V2 文件夹、ZIP 和 Codex 外观包；[自己做一只猫](CREATE_YOUR_CAT.md)。
- 免费个人 API 聊天，密钥由本机 OS 加密保存；不会从共享免费服务自动切换个人接口。
- 喂食、铲屎、小笑话、Open-Meteo 城市天气和明日预报。
- 20张核验来源的每日专辑、媒体原评分、推荐语，以及网易云/Spotify 搜索入口。
- 首次免费 API 获取指南；共享额度不足时可关闭的接入提醒。同一周期低额度和耗尽各提醒一次，短期限流只提示稍等。

共享额度提醒已经用真实桌面 UI 的合成网关响应验证；这不代表公共网关已经部署。

## 开发与验证

需要 Node24、pnpm11。安装依赖后：

```sh
pnpm install --frozen-lockfile
pnpm --filter @open-pets/desktop dev
node plugins/official/extrafriendly.cat/build.mjs
node --test plugins/official/extrafriendly.cat/test.js services/free-gateway/tests/*.test.js
pnpm --filter @open-pets/desktop check
```

当前27项猫模块、22项网关测试，以及原生 Windows 验证已通过。全量上游测试在本机遇到符号链接权限限制，相关测试独立通过；CI 会补平台检查。完整证据和已知限制见 [VALIDATION.md](VALIDATION.md)。

Windows/macOS 打包见 [EXTRAFRIENDLY.md](EXTRAFRIENDLY.md) 与 `.github/workflows/extrafriendly-desktop.yml`。免费网关的 Node/Cloudflare 适配、固定免费模型、原子额度和公开部署限制见 [网关说明](services/free-gateway/README.md)。

`apikeys/`、本机数据库、构建产物和个人配置不提交到 Git。不要把 Key 放进外观包；在自己的客户端设置或网关部署平台密钥设置中填写。

## 许可

[MIT](LICENSE)。感谢 OpenPets 及其贡献者；本版基线为 `1049485b7a940d196c8b37ab265fcbbbc13cb5b7`。本项目不向 OpenPets 上游发布更新，也没有启用自己的自动更新渠道。

公开 Git 历史从清理后的源码快照开始，避免继承原项目历史中的 OAuth 凭据。未随本产品打包的上游 Calendar Airmail 示例也已移除硬编码凭据，复用它需要自己的 OAuth 应用。
