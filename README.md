# <img src="favicon.svg" alt="" width="32" height="32"> ImgExplorer

ImgExplorer is a small localhost teaching workbench for image metadata, pixel inspection, image comparison, and introductory least-significant-bit (LSB) steganography.

## Note on AI Assisted Development

This software was developed with the assistance of **GitHub Copilot** to support classroom discussions and hands-on learning around **image analysis, including metadata extraction and steganography**. These tools helped accelerate development and improve development velocity.

This project is still under active development and should be considered **alpha-level software at best**. It has not yet undergone comprehensive testing, and bugs or unexpected behaviour may still be present.

If you encounter any issues or identify potential flaws, please feel free to submit an **issue or pull request** with your findings and, where possible, proposed fixes.

Following thorough **end-to-end testing and validation**, a stable release will be published.


## Run it

### From the repository

1. Ensure `python` is on your PATH.
2. Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

3. From this folder, run:

```powershell
python server.py
```

4. Open <http://localhost:8000>.

### As an installed command

From a checkout of this repository:

```powershell
python -m pip install .
imgexplorer
```

For development, use an editable install:

```powershell
python -m pip install -e .
```

The package metadata is defined in `pyproject.toml`. A future release can be built and published to PyPI under the name `imgexplorer`.

Pillow and stegano power the metadata and steganography endpoints. The tool status line reports their installed versions; the project targets stegano 3.x (`stegano>=3.0,<4`).

The app also serves a local ImgExplorer favicon matching the `//` brand mark.

## What is included

- **Quick overview:** browser-derived dimensions, pixel count, file size, and average RGB channels.
- **Metadata analysis:** Pillow returns format, mode, dimensions, pixel count, image info, and EXIF tags. GPS IFD values are expanded into named fields with decimal latitude and longitude when present. The UI defaults to a readable table and also offers a JSON view.
- **Pixel matrix:** displays the first 8 x 8, 16 x 16, or 32 x 32 values for luma or a selected RGB channel.
- **Image comparison:** optionally loads a second and third image, shows previews side by side, and provides separate Image 1 vs Image 2 and Image 1 vs Image 3 comparisons. Each pair reports affected-pixel counts, provides a microscope zoom button, and offers Image/Pixel tabs.
- **LSB experiment:** sends the cover image and a text or file payload to `stegano.lsb.hide`, compares the original and encoded pixels, highlights changed pixels in red, offers a zoom view, and downloads a lossless PNG.
- **Affected pixels:** switches between the zoomable image diff and an RGB matrix where changed cells are highlighted yellow. The matrix size follows the 8 x 8, 16 x 16, or 32 x 32 selector.
- **Data decoding:** the Encode data panel can hide text or a file and decode from the cover, comparison images, or generated encoded output. File payloads retain their filename and MIME type and can be downloaded after decoding.

## Important classroom notes

The LSB view marks pixels whose RGB values changed, not just the individual bit positions. A single pixel can contain one, two, or three changed channel bits. PNG is used for the encoded download so a lossy JPEG round-trip does not destroy the demonstration. Comparison counts include pixels introduced by dimension mismatches; identical decoded images report zero affected pixels.

Do not expose this development server to an untrusted network. Image bytes are processed in memory and the server does not accept arbitrary shell commands. Use PNG or JPEG/WEBP images for the main image workflow.

## Acknowledgements

- Metadata functionality uses **Pillow**, the friendly Python Imaging Library.
- Steganography functionality uses **stegano**, an open-source Python steganography library built around LSB techniques.
- [Anant Shrivastava](https://github.com/anantshri) for suggested enhancements.

## Project

© 2026 ImgExplorer contributors · [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html) · [GitHub](https://github.com/AngieGit/imgexplorer)

All analysis runs locally — evidence never leaves your machine.
