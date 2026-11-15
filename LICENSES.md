# Licences and credits — EBN Geography | China Week 3 | 3D

## Third-party code bundled into the HTML file

### three.js r170 (MIT Licence)
Used for all WebGL rendering, the camera controls (`OrbitControls`) and the
physically based sky (`Sky`, Preetham model). Pinned to version 0.170.0.

    The MIT License
    
    Copyright © 2010-2024 three.js authors
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

No other runtime libraries are included. Build tools (TypeScript, esbuild) are
used only during development and are not part of the delivered file.

## Assets

**No external images, 3D models, textures, fonts or sounds are used.**
Everything in both scenes is generated in code when the page opens:

- Buildings, factories, port cranes, ships, vehicles, trees, wells and pumps:
  procedural geometry written for this project (`src/scenes/**/`).
- Surface detail (windows, glass, tiles, farmland, rock layers, grains, water):
  GLSL shaders written for this project.
- Water normal map, particle sprites and well-screen texture: generated in code
  (`src/shared/ProceduralTextures.ts`, `src/scenes/groundwater/WellSystem.ts`).
- Text uses the computer's own system fonts (Segoe UI on Windows).

Landmark towers in the Shenzhen scene are *inspired by* the general form of
recent Pearl River Delta skyscrapers. They are not models of, and are not
labelled as, any real building.

## Educational content

Teaching text, vocabulary and figures come from the EBN Academy 2 worksheet
"02 Factory of the World, Blue & White" (Geography, Autumn 2, Week 3), which
cites:

- Shenzhen population ≈ 330,000 (1980): Shenzhen Statistical Yearbook.
- Shenzhen population over 17 million (2020): Shenzhen census.
- China makes about 3 in 10 of the world's manufactured goods: UN Statistics
  Division (2023). Shown as a **China-wide** figure.

Groundwater model parameters are illustrative textbook-style values (see
`README.md` → *Scientific model*). They are not measurements of northern China,
Plachimada or any other real place.
