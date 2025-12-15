# The Tiny Image Museum 🔬

A research repository pushing the limits of file formats, browser parsers, and Git rendering.

## S Tier
| File | Size | Format | The Trick | Git Render? |
| :--- | :--- | :--- | :--- | :--- |
| **[5.svg](5.svg)** | **5 B** | SVG | `printf "<svg>" > 5.svg` <br> Abuses HTML5 parser auto-closing. | ✅ **YES** |

## A Tier

| File | Size | Description | Preview |
| :--- | :--- | :--- | :--- |
| **[void.svg](void.svg)** | 6 B | Self-closing XML tag. `printf "<svg/>"` | <img src="void.svg" width="20" height="20" title="6 bytes"> |
| **[pixel.gif](pixel.gif)** | 35 B | The smallest standard-compliant GIF. | <img src="pixel.gif" width="20" height="20" title="35 bytes"> |
| **[secret.gif](secret.gif)** | 35 B | **Steganography.** Contains hidden text "see me" inside the hex code. | <img src="secret.gif" width="20" height="20" title="Hidden Message"> |
| **[runme.gif](runme.gif)** | 14 B | **Polyglot.** A valid image AND a valid shell script. | <img src="runme.gif" width="20" height="20" title="Executable"> |

## Tricks

These files use system-level hacks and do not render as standard images in a browser.

| File | Size | The Hack | Behavior |
| :--- | :--- | :--- | :--- |
| **[pixel.ansi](pixel.ansi)** | 5 B | ANSI Escape Code `\x1b[7m ` | Renders a white pixel in **Terminal** (`cat pixel.ansi`). |
| **[image.gif](image.gif)** | 0 B | Directory Imposter | It's a folder named `.gif`. Git shows it as a folder, confusing the user. |
| **[giant.img](giant.img)** | 1 TB | Sparse File | Claims to be 1 Terabyte on disk, occupies 0 bytes. |
| **[[U+202E]gnp.gif](%5BU%2B202E%5Dgnp.gif)** | 35 B | Unicode Override | Forces RTL text rendering. Looks like `fig.png` in some lists. |

## F Tier

* **4.svg (4 B):** Parser crashed. (Too aggressive).
* **risk.gif (10 B):** Header truncation failed in this environment.
* **pixel.tga (19 B):** Format unsupported by modern browser engines.

## The Quine
This image is its own source code: <img src="data:image/svg+xml;utf8,<svg>" />
