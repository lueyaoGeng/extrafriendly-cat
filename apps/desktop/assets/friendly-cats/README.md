# 原创猫猫皮肤

三个包由 `scripts/friendly-cat-assets.mjs` 的原创 SVG 几何图形生成，按本仓库 MIT 许可证发布，无第三方角色素材。运行 `node scripts/friendly-cat-assets.mjs` 可重建透明 WebP、缩略图和各平台图标；需要先安装桌面包的 Sharp 依赖。

每个包有 `pet.json` 和 `spritesheet.webp`。格式遵循现有 Native/Codex V2 导入合同：1536×2288，8 列 11 行，每帧 192×208，单张带 alpha 的 WebP。前九行依次是呼吸、向右跑、向左跑、挥爪、跳跃、反应、等待、活动、思考；最后两行是顺时针的 16 个视线方向。第 0 行第 6 列是静止预览。

用户可选择“从文件夹导入”导入整个皮肤目录，也可将 `pet.json` 与 `spritesheet.webp` 放在 ZIP 根目录后导入。制作自己外观时保留这个布局；修改 `id` 后同时修改目录名。皮肤只包含图像和 JSON，不需要运行作者提供的代码。
