# Google Ultimate Framework

A modular userscript framework for Google. It adds a control panel to Google search pages with a collection of mods that modify the appearance and behaviour of the page. Mods range from practical utilities to visual effects and outright chaos.

## Requirements

- A userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
- A Chromium-based browser or Firefox

## Installation

1. Install Tampermonkey (or Violentmonkey) as a browser extension.
2. Open the extension dashboard and create a new script.
3. Delete the placeholder code and paste the entire contents of `Google Ultimate Framework.user.js`.
4. Save the script. The framework activates automatically on any Google search page.

Alternatively, if your userscript manager supports direct installs, click "Install from file" and select the `.user.js` file.

## Usage

A button labelled "G-Mods" appears in the bottom-right corner of every Google page. Click it to open the mod panel. When one or more mods are active, the button turns green and shows the active count in brackets.

- **Search bar**: type to filter mods by name or description.
- **Toggle mods**: click a mod row to switch it on or off. A green border indicates an active mod.
- **Settings**: mods that have configurable options show a gear button on the right. Click it to expand the settings panel. Changes apply immediately.
- **Action mods**: these run a one-time effect when clicked rather than toggling.
- **Keyboard shortcut**: press Escape to close the panel.

All active mods and their settings are stored in the browser's local storage and restored automatically when you reload the page.

## Mod list

### Chaos & Zerstörung
| Mod | Description |
|-----|-------------|
| Schwerkraft | All elements fall off the screen. Fall duration is configurable. |
| Fliehendes Suchfeld | The search bar runs away from the cursor. |
| Thanos Snap | Instantly removes 50% of page elements with a fade-out. |
| Erdbeben | Shakes the entire page continuously. Intensity is configurable. |
| Link Roulette | Randomly redirects link clicks to a Rickroll video. Probability is configurable. |
| Zoom-Puls | The page rhythmically zooms in and out. Speed is configurable. |
| Cursor-Chaos | Every element gets a different random cursor on hover. |

### Optik & Design
| Mod | Description |
|-----|-------------|
| Disco Google | Cycles through hue rotations continuously. Speed and colour intensity are configurable. |
| Comic Sans | Forces Comic Sans as the page font. |
| Konfetti-Klicks | Each mouse click spawns a burst of confetti particles. Amount is configurable. |
| Regenbogen-Schweif | The cursor leaves a fading rainbow trail. |
| Night Light | Adds a warm yellow filter to reduce blue light. Intensity is configurable. |
| Großschrift | Increases the base font size of the page. Scale is configurable. |
| Slow Motion | Stretches all CSS animations and transitions. Factor is configurable. |

### Nützlich
| Mod | Description |
|-----|-------------|
| Text bearbeiten | Enables `document.designMode`. Every text node on the page becomes editable. |
| Fokus Spotlight | Dims the page and illuminates only the area around the cursor. Radius is configurable. |
| High-Contrast Dark Mode | Inverts the page colours for a deep dark mode. Hue offset is configurable. |
| Lese-Modus | Hides ads and sidebars and centres the main content column. |
| Scroll-Tempo | Multiplies scroll speed for the mouse wheel. Multiplier is configurable. |
| Eigenes CSS | Injects arbitrary CSS into the page. Useful for custom styling. |

### Nerd
| Mod | Description |
|-----|-------------|
| Matrix Regen | Renders a falling green code animation over the page via a canvas overlay. Colour and opacity are configurable. |
| Ladezeiten-Spion | Reads the Performance API and logs a table of the 15 slowest network requests to the console. |
| FPS-Zähler | Displays a live frames-per-second counter in the top-left corner. |
| Cookie-Inspektor | Reads `document.cookie` and prints a formatted table to the console. |
| X-Ray Modus | Draws coloured outlines around every DOM element by nesting depth. Useful for layout debugging. |
| Tasten-Anzeige | Shows each key press as large text in the centre of the screen. |

### Spaß & Memes
| Mod | Description |
|-----|-------------|
| Doge Invasion | Replaces all images on the page with the classic Doge meme. |
| Do a Barrel Roll | Rotates the page body 360 degrees once. |
| Ungeduldiges Google | Images, inputs and buttons wiggle continuously. |
| Auf dem Kopf | Flips the entire page upside down. |
| Schneefall | Spawns animated snowflakes over the page. Amount is configurable. |
| Feuerwerk | Each mouse click triggers a firework burst. Spark count is configurable. |

### System
| Mod | Description |
|-----|-------------|
| System Reset | Clears all saved settings and active mods from local storage, then reloads the page. |

## Adding new mods

Mods are plain JavaScript objects registered with `ModManager.register()`. Place the call anywhere before the `initUI()` call at the bottom.

```javascript
ModManager.register({
    id: 'myMod',                    // unique identifier
    name: 'My Mod',                 // display name
    category: 'Nützlich',          // category shown in the panel
    description: 'Does something.', // short description shown under the name
    type: 'toggle',                 // 'toggle' or 'action'
    settingsSchema: [               // optional; omit if no settings needed
        { id: 'speed', label: 'Speed', type: 'range', min: 1, max: 10, default: 5 }
    ],
    enable: (ctx, settings) => {
        // runs when the mod is switched on
        // use ctx methods instead of raw browser APIs so cleanup is automatic
        ctx.addStyle(`body { background: red !important; }`);
        ctx.setInterval(() => console.log('tick'), 1000);
        ctx.addEventListener(document.body, 'click', (e) => console.log(e));
        const el = ctx.createElement('div', document.body); // auto-removed on disable
    },
    disable: (ctx) => {
        // optional; runs before automatic cleanup
        // use this for effects that ctx.cleanup() cannot handle on its own
    }
});
```

### ModContext API

Every `enable` function receives a `ctx` (ModContext) instance. Use its methods to ensure all resources are freed when the mod is disabled.

| Method | Description |
|--------|-------------|
| `ctx.setInterval(fn, ms)` | Like `setInterval`, but tracked and auto-cleared on disable. |
| `ctx.setTimeout(fn, ms)` | Like `setTimeout`, but tracked and auto-cleared on disable. |
| `ctx.addEventListener(target, event, fn, options?)` | Attaches an event listener that is automatically removed on disable. |
| `ctx.addStyle(cssString)` | Injects a `<style>` element that is removed on disable. |
| `ctx.createElement(tag, parent?)` | Creates and appends a DOM element that is removed on disable. |

### Settings schema types

| Type | Usage |
|------|-------|
| `range` | Renders a range slider. Requires `min`, `max`, and `default`. |
| `color` | Renders a colour picker. Requires a hex `default` value. |
| `textarea` | Renders a resizable text area. Useful for multi-line input such as CSS. |

## License

GNU General Public License v3. See `LICENSE` for the full text.
