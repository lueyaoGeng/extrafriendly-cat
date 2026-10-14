# 把自己的猫放到桌面上

在猫猫设置点「挑选 / 导入猫猫」，高级外观页里的「安装本地宠物」可以导入文件夹或 ZIP。开启「自定义猫猫」才能导入；关闭后保留已经选中的外观。

本版复用 OpenPets/Codex V2 外观格式，不运行皮肤作者的程序。标准文件夹包含：

```text
my-cat/
  pet.json
  spritesheet.webp
```

```json
{
  "id": "my-cat",
  "displayName": "我的猫",
  "description": "我自己做的猫猫",
  "spritesheetPath": "spritesheet.webp",
  "spriteVersionNumber": 2,
  "gazeAnchor": { "x": 0.5, "y": 0.46 }
}
```

`id` 要与文件夹名相同，仅使用小写字母、数字、连字符或下划线。精灵图是透明 WebP，尺寸1536×2288，按8列×11行排列，每格192×208。静态外观也可以把同一帧铺满所有格，功能照常可用。不要使用 `builtin` 或应用预置皮肤的 ID。

下面这段可以直接复制给 Codex，生成的包拿回来导入：

> 为 Extrafriendly Cat 制作一只我自己的猫。外观描述：在这里写猫的颜色、形状、表情和画风。请输出名为 my-cat 的文件夹，只含 pet.json 和 spritesheet.webp。pet.json 使用上面的 V2 字段，id 与文件夹同名。透明 WebP 必须是1536×2288、8列×11行、每格192×208，全部格子都有效且背景透明。先做静态可用版，把同一帧铺满；需要动画时按 Codex/OpenPets V2 动作布局制作，不能把不相关的表情随机塞进动作行。不要附加需要桌宠执行的脚本。导入包后，聊天、喂食和铲屎由桌宠本身负责。

仓库内 `scripts/friendly-cat-assets.mjs` 是三个预置猫的可复现生成器，可以让 Codex以它为起点修改颜色和几何造型。`apps/desktop/assets/friendly-cats/` 提供完整示例。单个 SVG/PNG 的直接粘贴与一键转换尚未纳入这个 MVP；可以先让 Codex转成上述标准包。
