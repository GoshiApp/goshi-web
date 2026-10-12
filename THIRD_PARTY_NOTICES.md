# Third party notices

Goshi's own code is written in this repository. The visual style of the real-time arena (a dark navy board with a faint
grid, glowing neon bodies with a bright head and two eyes, soft glowing pellets, a nitro bar, a leaderboard and a mini
map) was studied from the two open source projects below, both under the MIT License. No source files were copied.
The arena code (`src/lib/play/arena-paint.ts`, `arena-fx.ts`, `arena-sound.ts`) was written for this project and adapts
only the general approach (for example: stroking a body as one thick round-joined path with a lighter shine on top,
and drawing pellets with a glow). The licenses are reproduced here as the MIT License asks.

## slither-vs-bots

- Project: slither-vs-bots
- URL: https://github.com/adylevy/slither-vs-bots
- License: MIT
- Used for: the look of the renderer, the head and eyes, the nitro bar and the leaderboard panel (ideas only).

```
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

(The license file of that project names no copyright holder.)

## slither-clone-sio

- Project: slither-clone-sio
- URL: https://github.com/mathe00/slither-clone-sio
- License: MIT
- Used for: the idea of a visible world boundary and a mini map (ideas only).

```
MIT License

Copyright (c) 2025 mathe00

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## npm dependencies

The packages the site and the Solana client are built with keep their own licenses in `node_modules` and are listed by
`npm ls`. Nothing from them is modified.
