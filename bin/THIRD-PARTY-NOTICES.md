# Third-party native converter notices

The native converter shipped in this directory is distributed as part of the
standalone `viso-to-svg` Obsidian plugin. It is kept separate from
`svg-to-excalidraw`.

## libvisio2svg

The macOS `vsd2svg-conv` executable and the `libVisio2Svg`/`libTitleGenerator`
libraries are built from [kakwa/libvisio2svg](https://github.com/kakwa/libvisio2svg),
version 0.5.8. The upstream project is licensed under GPLv2; the complete
license text is available in the upstream repository's [`LICENSE`](https://github.com/kakwa/libvisio2svg/blob/0.5.8/LICENSE)
file. The source code and build scripts used for this binary are available from
the same tagged source tree.

## Runtime libraries

The macOS bundle includes Universal binaries built from the following upstream
projects. Their original license and copyright notices remain applicable:

- [libvisio](https://github.com/LibreOffice/libvisio) — MPL-2.0 / compatible project notices.
- [librevenge](https://sourceforge.net/p/libwpd/wiki/librevenge/) — LGPL-2.1-or-later.
- [libemf2svg](https://github.com/kakwa/libemf2svg) — GPLv2.
- [libwmf](https://wvware.sourceforge.net/libwmf.html) — LGPL-2.1-or-later.
- [FreeType](https://freetype.org/license.html) — FreeType License / GPL-2.0-or-later.
- [fontconfig](https://gitlab.freedesktop.org/fontconfig/fontconfig) — MIT-like license.
- [libpng](http://www.libpng.org/pub/png/libpng.html) — libpng license.
- [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) — IJG / BSD-style licenses.
- [ICU](https://icu.unicode.org/) — ICU License.
- [gettext](https://www.gnu.org/software/gettext/) — LGPL-2.1-or-later.

System libraries supplied by macOS, including `libSystem`, `libc++`, `libxml2`,
`libz`, `libiconv`, `libexpat`, `libbz2`, and Apple frameworks, are not bundled.
