# 免费聊天网关

这是客户端之外的独立后端，支持 Node.js＋持久化 SQLite，以及 Cloudflare Worker＋SQLite Durable Object。默认推理接入智谱免费模型 `glm-4-flash-250414`；只允许该固定模型，不接受客户端指定其他模型，没有付费回退。安装包不携带共享 Key。

2026-10-14 已用用户提供的 Key 完成真实 Node HTTP → 智谱调用；这仍是本机网关，**尚未部署公共服务**。已有阿里云账号，但没有服务器、域名或可部署凭据；其他电脑不能通过安装包共享这个本地接口。客户端可以先各自配置免费的个人 API。

## 无 Key 的本机接口演示

需要 Node.js 24 或更高版本，测试和本地演示不需要安装依赖。在本目录执行：

```powershell
node --test tests/*.test.js
node mock-server.js
```

演示服务只监听 `127.0.0.1:8788`。`GET http://127.0.0.1:8788/health` 会返回 `mode: "mock"`。回复明确以「【本地接口演示，非 AI 回复】」开头，没有调用任何模型。默认配额保存在内存，重启会重置；验证重启持久性时可设置 `$env:MOCK_QUOTA_DB='D:\My Project\extrafriendly-cat\services\free-gateway\mock-quota.sqlite'`。

```powershell
$body = @{
  model = 'extrafriendly-free'
  messages = @(@{role='user'; content='今天有点累，陪我一会儿。'})
  max_tokens = 384
  stream = $false
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri 'http://127.0.0.1:8788/v1/chat/completions' `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Headers @{'X-Device-Id'='local-device-00000001'} -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

桌面插件只允许声明过的 HTTPS 域名，发布版不会自动连接这个 HTTP 演示端口。这个模式用于开发和接口检查，不能代替真实免费聊天。

## 用智谱 Key 运行真实免费网关

需要 Node24、一个持久化数据目录和智谱 API Key。先在[官方价格页](https://docs.bigmodel.cn/cn/guide/start/pricing)确认 `GLM-4-Flash-250414` 的输入与输出均免费，再设置 `FREE_MODEL_CONFIRMED`。设置 Key 时使用安全输入，不写进命令历史：

```powershell
$gatewaySecret = Read-Host '智谱 API Key' -AsSecureString
$env:BIGMODEL_API_KEY = [Net.NetworkCredential]::new('', $gatewaySecret).Password
$env:FREE_MODEL_CONFIRMED = 'glm-4-flash-250414'
$env:QUOTA_DB_PATH = 'D:\My Project\extrafriendly-cat\services\free-gateway\gateway-quota.sqlite'
try {
  node node-server.js
} finally {
  Remove-Item Env:BIGMODEL_API_KEY
  Remove-Item Env:FREE_MODEL_CONFIRMED
}
```

默认监听 `127.0.0.1:8788`；`/health` 显示配置是否齐全，聊天请求格式同上。确认项或 Key 缺失会停止调用，而不是替换模型。`/health` 不是服务商实时可用性或价格探测。2026-10-14 官方还列有免费 GLM-4.7-Flash，但本账号实测返回模型繁忙，因此本版固定使用已成功返回的 GLM-4-Flash-250414。

设备每天20次、IP每天40次、共享每天200次、设备每分钟5次，任何一项耗尽即停止相应请求，错误调用也保留计数。配置只能向下调整。智谱模式不消耗 Cloudflare neurons，`neuronBudgetRemaining` 在这个模式下不代表智谱额度；智谱仍有账号级并发/频率限制。自己创建更多 Key 不会创造更多账号额度。免费政策改变时应停用网关并重新核验，不承诺永久无限免费。

公网 Node 部署必须由**单个进程**拥有同一个持久化 SQLite 数据库；不能复制进程或将数据库放在临时函数磁盘上。用 HTTPS 反向代理暴露接口。默认不信任客户端的 `X-Real-IP`，代理必须先清除并重写该头，且在 `TRUSTED_PROXY_IPS` 中明确列出代理 IP，否则按实际连接 IP 计额。服务器 Key 放部署平台的密钥设置，不打入镜像、不写进 Git。

项目根目录可运行 `node scripts/verify-live-gateway.mjs` 验证真实调用。这个可选脚本私下读取已忽略的 `apikeys/` 文件，只输出状态、模型与额度，不输出 Key 或聊天全文；不要把个人 `apikeys/` 放入发布包。

## 客户端合同

| 请求 | 返回 |
| --- | --- |
| `GET /health` | `available`、`mode`、模型、限额、UTC 重置时间；不会消耗聊天额度。`available` 仅表示后端依赖存在，不是模型实时探测。 |
| `POST /v1/chat/completions` | OpenAI 兼容的 `choices[0].message.content`，非流式；附加 `gateway.mode` 和剩余额度。 |

请求必须使用 `Content-Type: application/json` 和 `X-Device-Id`。客户端首次启动生成随机 UUID 并本地保存，后续复用；设备 ID 支持 16–80 位字母、数字、`_`、`-`。无需 Authorization。ID 不是身份认证，用户可自行更换，所以还设有同 IP 和共享总量限制。

请求 `model` 只能为空或 `extrafriendly-free`；`stream` 只能为空或 `false`。最多 13 条消息（包括可选 system），单条 UTF-8 2 KiB，总历史 8 KiB，完整请求 16 KiB，回复最多 384 tokens。只接受 user/assistant/system 文字，不接受工具调用、多条并行生成、图片或任意第三方模型。客户端 system 文本会被丢弃，服务端猫人格是唯一 system 指令，聊天历史不会存进数据库。

`400/413/415` 表示请求不合法；`429` 表示额度或短期频率限制，携带 `Retry-After` 秒数；`503` 表示后端暂时不可用。客户端应显示这些情况并保留本地功能，不能自动改用用户的个人 API。

`gateway.quota` 包含 `status`（`ok/low/exhausted/busy`）、`scope`（`device/ip/global/budget/burst`）、剩余次数和 `resetsAt`。低额度按实际配置的日额度比例不高于20%计算；设备、IP、共享或计算预算中最紧的日额度决定提醒。分钟频率限制返回 `busy`，不会误报今天用完。已经预留额度的模型错误也携带剩余信息，未消耗额度的配置错误不伪造数字。客户端对日期、数值和允许状态校验，每个周期最多一次低额度和一次耗尽提醒，并支持关闭。

## Cloudflare 备选推理与配额

只有显式设置 `INFERENCE_PROVIDER=cloudflare` 才使用 `@cf/meta/llama-3.1-8b-instruct-fp8`。2026-10-13 读取的 [Cloudflare 官方模型页面](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/) 仍列出该模型；模型表现特别是中文语气尚需部署后实测。旧 `llama-3.1-8b-instruct-fast` 名称不能沿用。没有自动从智谱切到 Cloudflare 推理。

根据 [Workers AI 官方价格](https://developers.cloudflare.com/workers-ai/platform/pricing/)，免费分配为账号每天 10,000 neurons，UTC 00:00 重置。免费套餐额度耗尽后会报错，付费套餐可能产生超额费用。这不是每位桌宠用户各 10,000，也不是永久无限免费。

网关默认限制：

- 每台设备 20 次/UTC 日，每个 IP 40 次/UTC 日，同一设备每分钟 5 次。
- 所有用户共享 200 次/UTC 日以及 **8,000 neurons/UTC 日**，任何一项耗尽都停用当天免费聊天。
- 按输入 UTF-8 字节的 token 上界、每条模板余量和最大输出 tokens，使用该固定模型的官方费率，在推理前预留最坏情况预算。这里是保守估算，实际可用次数取决于消息长度。
- 模型错误或 25 秒超时也保留额度，因为上游可能已经消耗计算。服务超时不保证上游推理被取消。

Cloudflare 上一个 SQLite Durable Object 是全部配额的唯一持久化所有者；Node 上对应一个持久化 SQLite。设备、IP、全球次数、计算预算和分钟频率在同一个同步事务中检查并更新。[SQLite Durable Object 存储文档](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) 定义其事务一致性。不要把这个计数改成最终一致 KV 的读取后写回，以免并发超用。

限额通过 `wrangler.jsonc` 的 vars 配置，只能向下调整；错误配置会关闭接口。提高限额或换模型需要修改服务器预算并重新核对模型价格。账号的其他 Worker/AI 调用也会使用共享免费分配，所以部署后仍须查看 Cloudflare 控制台，不应将本服务的预算视为全账号无费用保证。

数据库只保存每日加盐 SHA-256 的设备/IP 配额键、计数和过期时间；过期计数在下一次请求清理。这里的「盐」是 UTC 日期，不是秘密，散列不能保证 IP 无法被枚举。应用不记录提示词、聊天全文、原始 IP 或共享密钥，Wrangler observability 默认关闭。聊天发送给选定的智谱或 Cloudflare 推理服务，需在发布时提供对应隐私说明。

## 目前的阿里云部署限制

用户要求不承担费用，本次未创建阿里云资源。[函数计算试用](https://help.aliyun.com/zh/functioncompute/trial-quota-1)仅3个月、每月15万CU，超额会计费，不能当成永久无费用的网关。

[ESA 免费函数模式](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/functions-and-pages-billing)每天10万请求，超额返回503；[免费站点套餐](https://help.aliyun.com/zh/edge-security-acceleration/esa/product-overview/free-plan)流量和请求不计费。但[公共预览地址](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/connect-pages-to-github)仅有效60分钟，持续服务需要域名和证书。用户目前没有域名；KV等附加服务的计费还需单独核对。

ESA 不是 Node 持久磁盘环境；[Edge KV 是最终一致](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/get-started-with-edge-kv)。当前 Node/Cloudflare 代码**不能直接作为 ESA 的已完成适配**。拥有阿里云账号仍不代表已有稳定域名、部署权限或原子额度存储。条件具备后再选择适合的部署方案。

## 以后部署到 Cloudflare

代码使用当前 [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/) 和 [SQLite Durable Object exports 配置](https://developers.cloudflare.com/durable-objects/get-started/)。固定 Wrangler 为 4.149.0，避免每次命令自动漂移版本。这里没有自动创建账号、登录、部署或发布。

已有账号以后在本目录执行：

```powershell
npx wrangler@4.149.0 login
npx wrangler@4.149.0 secret put BIGMODEL_API_KEY
npx wrangler@4.149.0 deploy
```

智谱模式部署前，在 `wrangler.jsonc` 将 `FREE_MODEL_CONFIRMED` 设为 `glm-4-flash-250414`；这不是密钥，真实 Key 用上述 secret put 安全输入。保留 `INFERENCE_PROVIDER=bigmodel`；仅主动选择 Cloudflare 推理才改为 `cloudflare`。Wrangler 创建 SQLite 配额对象，不需要把云令牌传给桌面用户。必须在免费套餐核对网关宿主、存储与模型费用，再请求线上 `/health` 和真实聊天。没有 Cloudflare 账号或大陆连通性实测，不能声称这条备选已上线或无需 VPN。

把真实地址写入桌面插件的 `gateway-config.js` 中的 `FREE_GATEWAY_URL`，同时将该 HTTPS 主机加入插件 manifest 的网络允许域名列表。客户端默认值继续留空，直到线上验证完成。验证免费回复、429 和停机 503 都能正常显示，再打包公开发布。中国大陆的具体网络可达性也须用真实网络验证。

不登录即可做编译检查：

```powershell
npx wrangler@4.149.0 deploy --dry-run
```

这只校验配置和生成 Worker bundle，不证明线上模型、计费额度或网络访问已通过。真实 macOS 和 Cloudflare 部署验证均不在本地接口测试的证据范围内。
