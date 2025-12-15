# The Tiny Image Experiments

Field test results for the smallest possible image files.

## 🏆 Winners

| Rank | File | Size | Format | Status | Preview (Stretched) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#1** | **void.gif** | **0 B** | NULL | **Existential Win** (Shows nothing, acts as spacer) | <img src="void.gif" width="20" height="20" alt="Void"> |
| **#2** | **void.svg** | **6 B** | XML | **The Champion.** Renders cleanly. | <img src="void.svg" width="20" height="20" alt="SVG"> |
| **#3** | **ghost.gif** | **14 B** | GIF89a | **Browser Only.** (Git shows 💔) | <img src="ghost.gif" width="20" height="20" alt="Ghost"> |
| **#4** | **pixel.gif** | **35 B** | GIF89a | **Reliable.** Works everywhere. | <img src="pixel.gif" width="20" height="20" alt="Pixel"> |

---

## 💀 Failed Exploits

These files failed to render in this environment (Windows / Git Web).

| File | Size | Technique | Failure Mode |
| :--- | :--- | :--- | :--- |
| **risk.gif** | 10 B | Truncated Header | 💔 Broken Image |
| **risk2.gif** | 10 B | Truncated Header | 💔 Broken Image |
| **trailerless.gif** | 13 B | No Trailer (3B) | 💔 Broken Image |
| **tiny.gif** | 26 B | No Palette/Footer | 💔 Broken Image |
| **pixel.bmp** | 30 B | OS/2 Header Hack | 💔 Broken Image |
| **pixel.tga** | 19 B | Truevision TGA | 💔 Format Unsupported |
| **pixel.wbmp** | 5 B | Wireless Bitmap | 💔 Format Unsupported |

## Hex Codes

**1. Void SVG (6 Bytes)**
Text: `<svg/>`

**2. Ghost GIF (14 Bytes)**
Hex: `47 49 46 38 39 61 01 00 01 00 00 00 00 3B`

**3. Pixel GIF (35 Bytes)**
Hex: `47 49 46 38 39 61 01 00 01 00 80 00 00 FF FF FF 00 00 00 2C 00 00 00 00 01 00 01 00 00 02 02 44 01 00 3B`
