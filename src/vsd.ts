import { Platform } from "obsidian";
import * as CFB from "cfb";
import { detectFileType, renderToSvg, WmfDrawer } from "wmf-emf-renderer";

declare const require: (moduleName: string) => any;

export interface VsdSvgPage {
  fileName: string;
  svg: string;
}

const normalizeSvgDimensions = (svg: string): string =>
  svg.replace(/<svg\b[^>]*>/iu, (svgTag) => {
    const viewBoxMatch = svgTag.match(
      /\bviewBox\s*=\s*["']\s*[-+\d.e]+\s+[-+\d.e]+\s+([-+\d.e]+)\s+([-+\d.e]+)\s*["']/iu,
    );
    const widthMatch = svgTag.match(
      /\bwidth\s*=\s*["']\s*([-+\d.e]+)\s*["']/iu,
    );
    const heightMatch = svgTag.match(
      /\bheight\s*=\s*["']\s*([-+\d.e]+)\s*["']/iu,
    );
    if (!viewBoxMatch || !widthMatch || !heightMatch) {
      return svgTag;
    }

    const viewBoxWidth = Number(viewBoxMatch[1]);
    const viewBoxHeight = Number(viewBoxMatch[2]);
    const width = Number(widthMatch[1]);
    const height = Number(heightMatch[1]);
    if (
      !Number.isFinite(viewBoxWidth) ||
      !Number.isFinite(viewBoxHeight) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width >= 100 ||
      height >= 100 ||
      viewBoxWidth <= 100 ||
      viewBoxHeight <= 100
    ) {
      return svgTag;
    }

    return svgTag
      .replace(widthMatch[0], `width="${widthMatch[1]}in"`)
      .replace(heightMatch[0], `height="${heightMatch[1]}in"`);
  });

const normalizeTextLineBreaks = (svg: string): string =>
  svg.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/giu,
    (_match, textAttributes: string, textContent: string) => {
      const spans = [...textContent.matchAll(/<tspan\b([^>]*)>/giu)];
      const x = textAttributes.match(/\bx\s*=\s*(["'])(.*?)\1/iu)?.[2];
      const spanStyleSignature = (attributes: string): string =>
        attributes.trim().replace(/\s+/gu, " ");
      const firstSpanStyle = spans[0]
        ? spanStyleSignature(spans[0][1])
        : "";
      const hasMixedSpanStyles = spans.some(
        (span) => spanStyleSignature(span[1]) !== firstSpanStyle,
      );
      if (
        spans.length < 2 ||
        !x ||
        hasMixedSpanStyles ||
        spans.some((span) => /\b(?:x|y|dx|dy)\s*=/iu.test(span[1]))
      ) {
        return _match;
      }

      let lineIndex = 0;
      const positionedText = textContent.replace(
        /<tspan\b([^>]*)>/giu,
        (_span, spanAttributes: string) => {
          const fontSizeValue =
            spanAttributes.match(/\bfont-size\s*=\s*(["'])(.*?)\1/iu)?.[2] ||
            textAttributes.match(/\bfont-size\s*=\s*(["'])(.*?)\1/iu)?.[2];
          const fontSize = Number.parseFloat(fontSizeValue || "");
          const lineHeight = Number.isFinite(fontSize)
            ? Number((fontSize * 1.2).toFixed(4))
            : 14.4;
          const linePosition =
            lineIndex++ === 0 ? ` x="${x}"` : ` x="${x}" dy="${lineHeight}"`;
          return `<tspan${spanAttributes}${linePosition}>`;
        },
      );

      return `<text${textAttributes}>${positionedText}</text>`;
    },
  );

const normalizeMarkerColors = (svg: string): string => {
  const withInheritedColors = svg.replace(
    /(<(?:polyline|path)\b[^>]*?)\sfill=["']solid["']/giu,
    '$1 fill="context-stroke"',
  );

  return withInheritedColors.replace(/<path\b[^>]*>/giu, (pathTag) => {
    const pathData = pathTag.match(/\bd=["']([^"']*)["']/iu)?.[1] || "";
    if (!/(?:^|\s)z(?:\s|$)/iu.test(pathData)) {
      return pathTag;
    }

    return pathTag
      .replace(/\s*marker-(?:start|end)=["'][^"']*["']/giu, "")
      .replace(/\s*marker-(?:start|end)\s*:\s*url\([^)]*\)\s*;?/giu, "");
  });
};

const normalizeMarkerPositions = (svg: string): string =>
  svg.replace(/<marker\b[^>]*>[\s\S]*?<\/marker>/giu, (markerTag) => {
    const points = markerTag.match(
      /<polyline\b[^>]*\bpoints\s*=\s*(["'])(.*?)\1/iu,
    )?.[2];
    const normalizedPoints = points?.trim().replace(/\s+/gu, " ");
    const refX =
      normalizedPoints === "10,0 0,5 10,10 9,5"
        ? "0"
        : normalizedPoints === "0,0 10,5 0,10 1,5"
          ? "10"
          : null;
    if (!refX) {
      return markerTag;
    }

    return markerTag.replace(
      /\brefX\s*=\s*(["'])[^"']*\1/iu,
      (_match, quote: string) => `refX=${quote}${refX}${quote}`,
    );
  });

interface NodeRuntime {
  fs: {
    access(path: string): Promise<void>;
    mkdtemp(prefix: string): Promise<string>;
    readdir(path: string): Promise<string[]>;
    readFile(path: string, encoding: "utf8"): Promise<string>;
    rm(
      path: string,
      options: { recursive: boolean; force: boolean },
    ): Promise<void>;
  };
  os: {
    tmpdir(): string;
  };
  path: {
    basename(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
  };
  childProcess: {
    execFile(
      file: string,
      args: string[],
      options: { encoding: "utf8"; windowsHide: boolean },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ): unknown;
  };
  buffer: any;
  zlib: {
    deflateSync(data: any): any;
  };
}

const loadNodeRuntime = (): NodeRuntime => ({
  fs: require("fs").promises,
  os: require("os"),
  path: require("path"),
  childProcess: require("child_process"),
  buffer: require("buffer").Buffer,
  zlib: require("zlib"),
});

const crc32 = (bytes: any): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (runtime: NodeRuntime, type: string, data: any): any => {
  const typeBytes = runtime.buffer.from(type, "ascii");
  const chunk = runtime.buffer.alloc(12 + data.length);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(data.length, 0);
  chunk.writeUInt32BE(
    crc32(runtime.buffer.concat([typeBytes, data])),
    data.length + 8,
  );
  return chunk;
};

const findLeadingBleedColumns = (
  bmp: any,
  pixelOffset: number,
  width: number,
  height: number,
  signedHeight: number,
  bytesPerPixel: number,
  sourceStride: number,
): number => {
  let firstContentColumn = -1;
  let emptyColumns = 0;
  const scanWidth = Math.min(width, 32);
  for (let x = 0; x < scanWidth; x += 1) {
    let hasContent = false;
    for (let y = 0; y < height; y += 1) {
      const sourceY = signedHeight > 0 ? height - 1 - y : y;
      const pixel = pixelOffset + sourceY * sourceStride + x * bytesPerPixel;
      const blue = bmp[pixel];
      const green = bmp[pixel + 1];
      const red = bmp[pixel + 2];
      const alpha = bytesPerPixel === 4 ? bmp[pixel + 3] : 255;
      if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
        hasContent = true;
        break;
      }
    }

    if (hasContent) {
      if (firstContentColumn === -1) {
        firstContentColumn = x;
      }
      emptyColumns = 0;
    } else if (firstContentColumn !== -1) {
      emptyColumns += 1;
      if (firstContentColumn <= 2 && emptyColumns >= 4) {
        return x - emptyColumns + 1;
      }
    }
  }
  return 0;
};

const bmpToPngDataUri = (
  runtime: NodeRuntime,
  base64: string,
): string | null => {
  const bmp = runtime.buffer.from(base64, "base64");
  if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) {
    return null;
  }

  const pixelOffset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const signedHeight = bmp.readInt32LE(22);
  const bitsPerPixel = bmp.readUInt16LE(28);
  const compression = bmp.readUInt32LE(30);
  const height = Math.abs(signedHeight);
  if (
    width <= 0 ||
    height <= 0 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32) ||
    (compression !== 0 && compression !== 3)
  ) {
    return null;
  }

  const bytesPerPixel = bitsPerPixel / 8;
  const sourceStride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const leadingBleedColumns = findLeadingBleedColumns(
    bmp,
    pixelOffset,
    width,
    height,
    signedHeight,
    bytesPerPixel,
    sourceStride,
  );
  const scanlines = runtime.buffer.alloc((width * 4 + 1) * height);
  for (let outputY = 0; outputY < height; outputY += 1) {
    const sourceY = signedHeight > 0 ? height - 1 - outputY : outputY;
    const sourceRow = pixelOffset + sourceY * sourceStride;
    const outputRow = outputY * (width * 4 + 1);
    scanlines[outputRow] = 0;
    for (let x = 0; x < width; x += 1) {
      const sourcePixel = sourceRow + x * bytesPerPixel;
      const outputPixel = outputRow + 1 + x * 4;
      if (x < leadingBleedColumns) {
        scanlines[outputPixel] = 255;
        scanlines[outputPixel + 1] = 255;
        scanlines[outputPixel + 2] = 255;
        scanlines[outputPixel + 3] = 255;
        continue;
      }
      scanlines[outputPixel] = bmp[sourcePixel + 2];
      scanlines[outputPixel + 1] = bmp[sourcePixel + 1];
      scanlines[outputPixel + 2] = bmp[sourcePixel];
      scanlines[outputPixel + 3] =
        bitsPerPixel === 32 ? bmp[sourcePixel + 3] || 255 : 255;
    }
  }

  const header = runtime.buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = runtime.buffer.concat([
    runtime.buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk(runtime, "IHDR", header),
    pngChunk(runtime, "IDAT", runtime.zlib.deflateSync(scanlines)),
    pngChunk(runtime, "IEND", runtime.buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
};

const normalizeEmbeddedImages = (svg: string, runtime: NodeRuntime): string =>
  svg.replace(
    /data:image\/bmp;base64,([A-Za-z0-9+/=\r\n]+?)(?=["'])/gu,
    (match, base64: string) => {
      const pngDataUri = bmpToPngDataUri(runtime, base64.replace(/\s+/gu, ""));
      return pngDataUri || match;
    },
  );

const getOlePreviewMetafile = (
  runtime: NodeRuntime,
  base64: string,
): Uint8Array | null => {
  try {
    const compoundFile = CFB.read(
      runtime.buffer.from(base64.replace(/\s+/gu, ""), "base64"),
    );
    const previewPath = compoundFile.FullPaths.find((fullPath) =>
      /OlePres000$/iu.test(fullPath),
    );
    if (!previewPath) {
      return null;
    }

    const previewEntry = CFB.find(compoundFile, previewPath);
    if (!previewEntry) {
      return null;
    }

    const preview = runtime.buffer.from(previewEntry.content);
    for (let offset = 20; offset < preview.length - 16; offset += 1) {
      const metafile = preview.subarray(offset);
      const fileType = detectFileType(metafile);
      if (fileType !== "unknown") {
        if (fileType === "wmf" || fileType === "placeable-wmf") {
          const placeableHeaderLength = fileType === "placeable-wmf" ? 22 : 0;
          const declaredLength =
            placeableHeaderLength +
            preview.readUInt32LE(offset + placeableHeaderLength + 6) * 2;
          if (
            declaredLength >= placeableHeaderLength + 18 &&
            declaredLength <= metafile.length
          ) {
            return metafile.subarray(0, declaredLength);
          }
        }
        return metafile;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const symbolDelimiterParts: Record<number, string> = {
  230: "\u239B",
  231: "\u239C",
  232: "\u239D",
  233: "\u23A1",
  234: "\u23A2",
  235: "\u23A3",
  236: "\u23A7",
  237: "\u23A8",
  238: "\u23A9",
  239: "\u23AA",
  246: "\u239E",
  247: "\u239F",
  248: "\u23A0",
  249: "\u23A4",
  250: "\u23A5",
  251: "\u23A6",
  252: "\u23AB",
  253: "\u23AC",
  254: "\u23AD",
};

interface WmfSymbolMapper {
  currentFontFace?: string;
  mapSymbolString(text: string): string;
}

const renderOleMetafile = (
  metafile: Uint8Array,
  options: { viewWidth: number; viewHeight: number },
): string => {
  const fileType = detectFileType(metafile);
  if (fileType !== "wmf" && fileType !== "placeable-wmf") {
    return renderToSvg(metafile, options);
  }

  const symbolMapper = WmfDrawer.prototype as unknown as WmfSymbolMapper;
  const originalMapSymbolString = symbolMapper.mapSymbolString;
  symbolMapper.mapSymbolString = function (text: string): string {
    if (!/symbol/iu.test(this.currentFontFace || "")) {
      return originalMapSymbolString.call(this, text);
    }

    return Array.from(text, (character) =>
      symbolDelimiterParts[character.charCodeAt(0)] ??
      originalMapSymbolString.call(this, character),
    ).join("");
  };

  let renderedSvg: string;
  try {
    renderedSvg = renderToSvg(metafile, options);
  } finally {
    symbolMapper.mapSymbolString = originalMapSymbolString;
  }

  return renderedSvg.replace(
    /<text\b[^>]*>[\s\S]*?<\/text>/giu,
    (textElement) => {
      if (!/[\u239B-\u23AD]/u.test(textElement)) {
        return textElement;
      }

      return textElement.replace(
        /font-family="[^"]*"/iu,
        'font-family="Segoe UI Symbol, Cambria Math, Symbol, sans-serif"',
      );
    },
  );
};

const normalizeEmbeddedOlePreviews = (
  svg: string,
  runtime: NodeRuntime,
): string =>
  svg.replace(/<image\b[^>]*>/giu, (imageTag) => {
    const hrefMatch = imageTag.match(
      /((?:xlink:)?href=["'])data:object\/ole;base64,([A-Za-z0-9+/=\r\n]+)(["'])/iu,
    );
    if (!hrefMatch) {
      return imageTag;
    }

    const metafile = getOlePreviewMetafile(runtime, hrefMatch[2]);
    if (!metafile) {
      return imageTag;
    }

    const dimension = (name: string, fallback: number): number => {
      const value = imageTag.match(
        new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)`, "iu"),
      )?.[1];
      const parsed = Number.parseFloat(value || "");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const renderedSvg = renderOleMetafile(metafile, {
      viewWidth: dimension("width", 800),
      viewHeight: dimension("height", 600),
    });
    const transparentSvg = renderedSvg.replace(
      /(<svg\b[^>]*>[\s\r\n]*)<rect\b(?=[^>]*\bx=["']0["'])(?=[^>]*\by=["']0["'])(?=[^>]*\bfill=["']#ffffff["'])[^>]*\/>/iu,
      "$1",
    );
    const renderedSvgBase64 = runtime.buffer
      .from(transparentSvg, "utf8")
      .toString("base64");

    return imageTag.replace(
      hrefMatch[0],
      `${hrefMatch[1]}data:image/svg+xml;base64,${renderedSvgBase64}${hrefMatch[3]}`,
    );
  });

const platformFolder = (): string => {
  if (Platform.isWin) {
    return "win-x64";
  }
  if (Platform.isMacOS) {
    return "darwin-universal";
  }
  if (Platform.isLinux) {
    return "linux-x64";
  }
  return "unknown";
};

const converterFileName = (): string =>
  Platform.isWin ? "vsd2svg-conv.exe" : "vsd2svg-conv";

export const getBundledConverterPath = (
  vaultBasePath: string,
  pluginDirectory: string,
): string => {
  const { path } = loadNodeRuntime();
  const absolutePluginDirectory = path.isAbsolute(pluginDirectory)
    ? pluginDirectory
    : path.join(vaultBasePath, pluginDirectory);
  return path.join(
    absolutePluginDirectory,
    "bin",
    platformFolder(),
    converterFileName(),
  );
};

const runConverter = (
  childProcess: NodeRuntime["childProcess"],
  converterPath: string,
  inputPath: string,
  outputDirectory: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    childProcess.execFile(
      converterPath,
      ["-i", inputPath, "-o", outputDirectory],
      { encoding: "utf8", windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr.trim();
          reject(
            new Error(
              detail
                ? `VSD conversion failed: ${detail}`
                : `VSD conversion failed: ${error.message}`,
            ),
          );
          return;
        }
        resolve();
      },
    );
  });

export const convertVsdToSvgPages = async ({
  converterPath,
  inputPath,
}: {
  converterPath: string;
  inputPath: string;
}): Promise<VsdSvgPage[]> => {
  const runtime = loadNodeRuntime();
  const temporaryDirectory = await runtime.fs.mkdtemp(
    runtime.path.join(runtime.os.tmpdir(), "viso-to-svg-vsd-"),
  );

  try {
    await runtime.fs.access(inputPath);
    await runtime.fs.access(converterPath);
    await runConverter(
      runtime.childProcess,
      converterPath,
      inputPath,
      temporaryDirectory,
    );

    const files = (await runtime.fs.readdir(temporaryDirectory))
      .filter((fileName) => fileName.toLowerCase().endsWith(".svg"))
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      );

    if (files.length === 0) {
      throw new Error("The VSD converter did not produce any SVG pages.");
    }

    return await Promise.all(
      files.map(async (fileName) => ({
        fileName,
        svg: normalizeMarkerPositions(
          normalizeMarkerColors(
            normalizeEmbeddedOlePreviews(
              normalizeEmbeddedImages(
                normalizeTextLineBreaks(
                  normalizeSvgDimensions(
                    await runtime.fs.readFile(
                      runtime.path.join(temporaryDirectory, fileName),
                      "utf8",
                    ),
                  ),
                ),
                runtime,
              ),
              runtime,
            ),
          ),
        ),
      })),
    );
  } finally {
    await runtime.fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
};
