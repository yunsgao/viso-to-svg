import {
  App,
  FileSystemAdapter,
  Notice,
  Plugin,
  PluginSettingTab,
  Platform,
  Setting,
  normalizePath,
} from "obsidian";
import { convertVsdToSvgPages, getBundledConverterPath } from "./vsd";

declare const require: (moduleName: string) => any;

interface VisioToSvgSettings {
  outputFolder: string;
  converterPath: string;
}

const DEFAULT_SETTINGS: VisioToSvgSettings = {
  outputFolder: "VSD-exports",
  converterPath: "",
};

export default class VisioToSvgPlugin extends Plugin {
  settings: VisioToSvgSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommand({
      id: "export-vsd-to-svg",
      name: "Export VSD to SVG",
      callback: () => void this.exportVsd(),
    });
    this.addSettingTab(new VisioToSvgSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async pickVsdFile(): Promise<{ name: string; path: string } | null> {
    const electron = require("electron") as {
      remote?: {
        dialog?: {
          showOpenDialog(options: {
            properties: string[];
            filters: { name: string; extensions: string[] }[];
          }): Promise<{ canceled: boolean; filePaths: string[] }>;
        };
      };
      dialog?: {
        showOpenDialog(options: {
          properties: string[];
          filters: { name: string; extensions: string[] }[];
        }): Promise<{ canceled: boolean; filePaths: string[] }>;
      };
    };
    const dialog = electron.remote?.dialog ?? electron.dialog;
    if (!dialog) {
      new Notice("Obsidian could not open a native file dialog.");
      return null;
    }

    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Visio drawing", extensions: ["vsd"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fileName = filePath.split(/[\\/]/u).pop() || filePath;
    return { name: fileName, path: filePath };
  }

  private getConverterPath(): string {
    const configuredPath = this.settings.converterPath.trim();
    if (configuredPath) {
      return configuredPath;
    }

    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      throw new Error("VSD export is only available on desktop Obsidian.");
    }

    const pluginDirectory =
      this.manifest.dir ||
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return getBundledConverterPath(
      this.app.vault.adapter.getBasePath(),
      pluginDirectory,
    );
  }

  private async exportVsd(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("VSD export is only available on desktop Obsidian.");
      return;
    }

    const selectedFile = await this.pickVsdFile();
    if (!selectedFile) {
      return;
    }

    try {
      const pages = await convertVsdToSvgPages({
        converterPath: this.getConverterPath(),
        inputPath: selectedFile.path,
      });
      const outputFolder = normalizePath(this.settings.outputFolder.trim());
      await this.ensureFolder(outputFolder);

      const sourceName = selectedFile.name.replace(/\.[^.]+$/u, "");
      const outputPaths: string[] = [];
      for (const [index, page] of pages.entries()) {
        const pageNumber = page.fileName.match(/-(\d+)\.svg$/iu)?.[1];
        const pageName = `page-${pageNumber || index + 1}`;
        const outputPath = await this.getAvailablePath(
          `${sourceName}-${pageName}`,
          ".svg",
          outputFolder,
        );
        await this.app.vault.create(outputPath, page.svg);
        outputPaths.push(outputPath);
      }

      new Notice(`VSD exported: ${outputPaths.length} SVG file(s).`);
      console.info("Visio to SVG export", outputPaths);
    } catch (error) {
      console.error("VSD export failed", error);
      new Notice(
        `VSD export failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async getAvailablePath(
    sourceName: string,
    extension: string,
    folder: string,
  ): Promise<string> {
    const effectiveFolder = normalizePath(folder || "");
    const safeBaseName = sourceName.replace(/[\\/:*?"<>|]/gu, "_");
    let index = 0;
    let outputPath = normalizePath(
      `${
        effectiveFolder ? `${effectiveFolder}/` : ""
      }${safeBaseName}${extension}`,
    );

    while (this.app.vault.getAbstractFileByPath(outputPath)) {
      index += 1;
      outputPath = normalizePath(
        `${
          effectiveFolder ? `${effectiveFolder}/` : ""
        }${safeBaseName}-${index}${extension}`,
      );
    }

    return outputPath;
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) {
      return;
    }

    let current = "";
    for (const part of folder.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

class VisioToSvgSettingTab extends PluginSettingTab {
  private readonly plugin: VisioToSvgPlugin;

  constructor(app: App, plugin: VisioToSvgPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Visio to SVG" });

    new Setting(containerEl)
      .setName("SVG output folder")
      .setDesc("Vault-relative folder for exported SVG files.")
      .addText((text) =>
        text
          .setPlaceholder("VSD-exports")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Converter path")
      .setDesc(
        "Optional absolute path to vsd2svg-conv. Leave empty to use the bundled converter.",
      )
      .addText((text) =>
        text
          .setPlaceholder("Use bundled converter")
          .setValue(this.plugin.settings.converterPath)
          .onChange(async (value) => {
            this.plugin.settings.converterPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
