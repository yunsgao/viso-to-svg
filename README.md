# viso-to-svg

独立的 Obsidian 桌面插件：将 Microsoft Visio 的 `.vsd` 文件转换为 SVG。

本项目与 `svg-to-excalidraw` 分开维护，不负责 SVG 到 Excalidraw 的转换。

## 构建

```bash
npm install
npm run build
```

构建结果位于 `dist-visio/`。将下面文件复制到 Obsidian vault 的
`.obsidian/plugins/viso-to-svg/`：

```text
dist-visio/main.js
visio-manifest.json  -> manifest.json
bin/
```

插件仅支持桌面版 Obsidian。Windows 转换器位于
`bin/win-x64/vsd2svg-conv.exe`；macOS 转换器应位于
`bin/darwin-universal/vsd2svg-conv`。macOS 和 Linux 转换器需要分别编译后再加入对应目录。

## 使用

在 Obsidian 命令面板执行 **Export VSD to SVG**，选择 VSD 文件后，SVG 页面会保存到设置中的输出目录，默认是 `VSD-exports`。
