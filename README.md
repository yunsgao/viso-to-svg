# viso to svg

独立的 Obsidian 桌面插件：将 Microsoft Visio 的 `.vsd` 文件转换为 SVG。

本项目与 `svg-to-excalidraw` 分开维护，不负责 SVG 到 Excalidraw 的转换，也不依赖或合并该项目的代码。

## 构建

```bash
npm install
npm run build
```

构建结果位于 `dist-visio/`。要生成可直接安装到 Obsidian 的目录，运行：

```bash
npm run package
```

打包结果位于 `release/viso-to-svg/`，也可以手动将下面文件复制到 Obsidian vault 的
`.obsidian/plugins/viso-to-svg/`：

```text
dist-visio/main.js
visio-manifest.json  -> manifest.json
bin/
```

插件仅支持桌面版 Obsidian。Windows 转换器位于
`bin/win-x64/vsd2svg-conv.exe`；macOS Universal 转换器位于
`bin/darwin-universal/vsd2svg-conv`，同时包含 Intel (`x86_64`) 和 Apple Silicon (`arm64`) 两个架构。
macOS 所需动态库也随插件放在同一目录，并使用相对加载路径，不依赖用户安装 Homebrew。

macOS 原生转换器基于 [libvisio2svg](https://github.com/kakwa/libvisio2svg) 构建。
第三方二进制的许可证和来源见 [`bin/THIRD-PARTY-NOTICES.md`](bin/THIRD-PARTY-NOTICES.md)。

## 使用

在 Obsidian 命令面板执行 **Export VSD to SVG**，选择 VSD 文件后，SVG 页面会保存到设置中的输出目录，默认是 `VSD-exports`。
