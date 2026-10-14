# Extrafriendly Cat

一只住在桌面上、站在你这边的猫。基于 [OpenPets](https://github.com/OpenPetsHQ/openpets) 的 MIT 源码二次开发；本轮基线为 `1049485b7a940d196c8b37ab265fcbbbc13cb5b7`。保留原仓库 LICENSE 和上游贡献者声明。

## 使用

启动 Windows 客户端后会出现猫猫和首次 API 引导，可以选择「先陪着我，稍后设置」。以后右键猫猫或系统托盘，选择「猫猫设置」。可以聊天、喂饭、铲屎、查看每日唱片、小笑话和天气；每项可独立关闭。照料关闭或退出程序时不会积累消耗，也没有好感、疾病或死亡惩罚。

内置奶油猫、墨墨猫、三花猫。在设置中点「挑选 / 导入猫猫」选择。外观包只含 `pet.json` 与透明 WebP 动作图，不执行第三方程序；支持文件夹、ZIP 和 Codex 制作的标准外观包。关闭自定义外观后会暂停新导入和新选择，保留当前猫猫。
给 Codex 的造猫提示词和可直接复制的格式见 [自己做一只猫](CREATE_YOUR_CAT.md)。本 MVP 使用标准 V2 包，单独 SVG/PNG 粘贴转换留到后续。

「统一免费服务」当前是**待上线**。已有阿里云账号，但尚无服务器、域名或可部署的云凭据；公共服务没有被冒称上线。现在可在「聊天与 API」按官方步骤获取自己的免费接口，点击「配置个人 API」填写地址、模型和 Key，保存并启用文本模型，再回到猫猫设置选择「使用我自己的 API」。推荐 `glm-4-flash-250414`，地址 `https://open.bigmodel.cn/api/paas/v4`；2026-10-14 已使用用户提供的 Key 验证真实回复，免费政策仍以服务商当前控制台为准。

首次使用及从 0.1 升级后各展示一次接入引导；日后可从「聊天与 API」或猫气泡的「API」重新打开。引导包括智谱、硅基流动的官方注册、接入和免费规则链接。共享额度剩余比例不高于 20% 或耗尽时提示接入自己的 API，每个额度周期只提醒一次低额度、一次耗尽；分钟限流只提示稍等。可独立关闭「API 接入与额度提醒」，仍能手动查看额度和引导。提醒由网关真实额度触发，尚未上线时不伪造使用次数。

API 密钥由主进程使用 OS safeStorage 加密，不写入猫模块的 JSON 状态，不在免费服务错误时自动调用个人接口。项目内的 `apikeys/` 被 Git 忽略且不进入安装包；本机配置不会随安装包分发。其他用户接入自己的 Key，或在未来公共网关上线后共享服务端账号的限额。

天气需要输入城市并确认候选结果，展示 Open-Meteo 当前天气与明日预报；缓存有获取时间和过期标识。专辑来自20张人工核验的种子资料，显示媒体原评分、来源和核验日期；Spotify 与网易云按钮明确是搜索入口，不保证特定地区可播放。推荐语按你的音乐写作特点整理，未声称是你亲自撰写。

## 开发

使用 Node24、pnpm11。`pnpm install --frozen-lockfile` 后：

```sh
pnpm --filter @open-pets/desktop dev
pnpm --filter @open-pets/desktop check
node plugins/official/extrafriendly.cat/build.mjs
node --test plugins/official/extrafriendly.cat/test.js
node --test services/free-gateway/tests/*.test.js
```

桌面 build 会先生成自包含猫模块；动画素材可用 `node scripts/friendly-cat-assets.mjs` 重建。Windows 数据在用户目录的 `.extrafriendly-cat`；macOS 在 Application Support/Extrafriendly Cat，与 OpenPets 分开。Windows 使用用户目录是为了避开本机 EFS 加密 AppData 中已复现的重命名失败，保持原子保存与皮肤事务，不修改系统加密设置。个人密钥仍由 safeStorage 加密。开发测试可用 `EXTRAFRIENDLY_TEST_PROFILE` 指定隔离目录；安装包忽略此变量。

## 打包与后续发布

Windows：`pnpm --filter @open-pets/desktop package` 走上游的签名/符号链接预检。当前构建机没有该权限，已用以下命令生成未签名测试安装包（PowerShell 中保留引号）。打包缓存仅写入项目目录，避免系统缓存目录的跨盘重命名失败：

```powershell
$env:ELECTRON_BUILDER_CACHE='D:\My Project\extrafriendly-cat\artifacts\builder-cache'
pnpm --filter @open-pets/desktop exec electron-builder --win nsis --x64 '-c.win.signAndEditExecutable=false' --publish never
```

将 `nsis` 改成 `dir` 可生成免安装目录包。公开发布前准备自己的签名和下载渠道。

macOS：构建流程在 `.github/workflows/extrafriendly-desktop.yml`，分别生成 Intel/Apple Silicon ZIP、DMG。需要在 Mac runner 上运行并补真实鼠标、透明点击穿透和休眠测试；Windows 的成功不能代替这些验证。当前尚未实机验证 Mac。

免费网关的本地运行、智谱真实接口、配额与 Cloudflare 备选部署步骤见 [网关说明](services/free-gateway/README.md)。已验证 Node HTTP 网关到智谱的真实免费调用；模拟模式仍明确标注为非 AI。公网部署需要稳定的 HTTPS 地址和持久化额度存储，再配置到猫模块并重建。阿里云 FC 试用超额会自动计费，ESA 免费函数的临时预览地址仅有效 60 分钟，本次没有开通收费资源。没有共享密钥嵌入客户端。

自动更新尚未配置自己的发布仓库，不指向上游 OpenPets 的更新。
