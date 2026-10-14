// Reviewed official entry points. Keys are entered only in the desktop host's settings.
export const API_GUIDE = {
  checkedAt: "2026-10-14",
  providers: [
    {
      id: "bigmodel",
      name: "智谱 BigModel",
      description: "推荐 GLM-4-Flash-250414，已验证可用于猫猫聊天。先在控制台确认该模型仍为免费，并查看账号的频率限制。",
      endpoint: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4-flash-250414",
      steps: ["注册账号，按平台要求完成认证。", "在控制台的 API Key 页面创建密钥。", "确认 GLM-4-Flash-250414 的输入、输出价格均为 0，再填写下方地址和模型名。"],
      links: {
        platform: "https://bigmodel.cn/",
        docs: "https://docs.bigmodel.cn/cn/guide/start/quick-start",
        source: "https://docs.bigmodel.cn/cn/guide/start/pricing",
      },
    },
    {
      id: "siliconflow",
      name: "硅基流动 SiliconFlow",
      description: "平台有按 0 元计费的免费模型；免费模型仍有频率限制。按控制台当前名单选择适合文字聊天的模型。",
      endpoint: "https://api.siliconflow.cn/v1",
      model: "复制所选免费文字聊天模型的完整模型 ID",
      steps: ["注册账号并完成实名认证。", "在控制台创建 API Key。", "在模型广场筛选免费文字聊天模型，确认输入、输出费用均为 0，复制完整模型 ID。"],
      links: {
        platform: "https://cloud.siliconflow.cn/",
        docs: "https://docs.siliconflow.cn/docs/userguide/quickstart",
        source: "https://docs.siliconflow.cn/docs/userguide/faqs/rate-limit-and-upgradation",
      },
    },
  ],
};

export function apiGuideLink(providerId, target) {
  if (!["platform", "docs", "source"].includes(target)) return null;
  return API_GUIDE.providers.find((provider) => provider.id === providerId)?.links[target] || null;
}
