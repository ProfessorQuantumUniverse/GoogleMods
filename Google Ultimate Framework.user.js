// ==UserScript==
// @name         Google Ultimate Framework V3
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Ein robustes, modulares Framework für Google-Mods mit Searchbar und Mod-Settings.
// @author       You / AI
// @match        *://*.google.com/*
// @match        *://*.google.de/*
// @match        *://*.google.ch/*
// @match        *://*.google.at/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // ⚙️ KERN-SYSTEM: STATE & PERSISTENCE
    // =========================================================================
    const STORAGE_KEY = 'GMods_Framework_V3';

    // Standard-Zustand des Frameworks
    let state = {
        activeMods:[], // Array von Mod-IDs, die aktuell an sind
        modSettings: {} // Objekt, das individuelle Settings der Mods speichert
    };

    // Lade State aus dem LocalStorage
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) state = { ...state, ...JSON.parse(saved) };
    } catch (e) { console.error("G-Mods: Fehler beim Laden des States", e); }

    const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // =========================================================================
    // 🛡️ KERN-SYSTEM: MOD CONTEXT (Das Aufräum-Kommando)
    // =========================================================================
    /*
     * Der ModContext wird an jede aktivierte Mod übergeben.
     * Anstatt window.setInterval zu nutzen, nutzt die Mod ctx.setInterval.
     * Wenn die Mod deaktiviert wird, räumt der Context ALLES automatisch auf!
     */
    class ModContext {
        constructor(modId) {
            this.modId = modId;
            this.intervals = [];
            this.timeouts =[];
            this.listeners = [];
            this.styles =[];
        }

        // Führt einen Intervall aus und merkt ihn sich
        setInterval(fn, ms) {
            const id = setInterval(fn, ms);
            this.intervals.push(id);
            return id;
        }

        // Führt einen Timeout aus und merkt ihn sich
        setTimeout(fn, ms) {
            const id = setTimeout(fn, ms);
            this.timeouts.push(id);
            return id;
        }

        // Hängt einen Event-Listener an und merkt ihn sich
        addEventListener(target, event, fn) {
            target.addEventListener(event, fn);
            this.listeners.push({ target, event, fn });
        }

        // Injiziert CSS ins Dokument (wirkt auf den Body) und merkt es sich
        addStyle(cssString) {
            const style = document.createElement('style');
            style.id = `gmod-style-${this.modId}`;
            style.innerHTML = cssString;
            document.head.appendChild(style);
            this.styles.push(style);
        }

        // Räumt rigoros alles ab, was die Mod gestartet hat
        cleanup() {
            this.intervals.forEach(clearInterval);
            this.timeouts.forEach(clearTimeout);
            this.listeners.forEach(l => l.target.removeEventListener(l.event, l.fn));
            this.styles.forEach(s => s.remove());

            // Inline-Styles vom Body putzen, falls die Mod sie verändert hat
            document.body.style.transform = '';
            document.body.style.filter = '';
            document.body.style.transition = '';
        }
    }

    // =========================================================================
    // 🧠 KERN-SYSTEM: MOD MANAGER
    // =========================================================================
    const ModManager = {
        registry: new Map(), // Speichert alle Mod-Definitionen
        activeContexts: new Map(), // Speichert die aktiven Contexts der laufenden Mods

        // Registriert eine neue Mod im System
        register(modDef) {
            this.registry.set(modDef.id, modDef);
            // Wenn es Settings gibt, stelle sicher, dass sie im State existieren
            if (modDef.settingsSchema && !state.modSettings[modDef.id]) {
                state.modSettings[modDef.id] = {};
                modDef.settingsSchema.forEach(s => {
                    state.modSettings[modDef.id][s.id] = s.default;
                });
            }
        },

        // Schaltet eine Mod an oder aus
        toggle(modId, forceState) {
            const mod = this.registry.get(modId);
            if (!mod) return;

            // Ist es ein reiner Button (Aktion)? Dann nur ausführen!
            if (mod.type === 'action') {
                mod.execute();
                return;
            }

            const isCurrentlyOn = state.activeMods.includes(modId);
            const turnOn = forceState !== undefined ? forceState : !isCurrentlyOn;

            if (turnOn && !isCurrentlyOn) {
                // MOD EINSCHALTEN
                state.activeMods.push(modId);
                const ctx = new ModContext(modId);
                this.activeContexts.set(modId, ctx);
                const settings = state.modSettings[modId] || {};

                try {
                    mod.enable(ctx, settings);
                } catch (e) { console.error(`Fehler in Mod ${modId}:`, e); }

            } else if (!turnOn && isCurrentlyOn) {
                // MOD AUSSCHALTEN
                state.activeMods = state.activeMods.filter(id => id !== modId);
                const ctx = this.activeContexts.get(modId);

                if (mod.disable) {
                    try { mod.disable(ctx); } catch (e) { console.error(`Fehler in Mod ${modId}:`, e); }
                }

                if (ctx) ctx.cleanup(); // Automatisches Aufräumen!
                this.activeContexts.delete(modId);
            }
            saveState();
        },

        // Wird aufgerufen, wenn ein User über das UI ein Setting der Mod ändert
        updateSetting(modId, settingId, value) {
            if (!state.modSettings[modId]) state.modSettings[modId] = {};
            state.modSettings[modId][settingId] = value;
            saveState();

            // Wenn die Mod an ist, schalte sie kurz aus und wieder an, um Settings anzuwenden
            if (state.activeMods.includes(modId)) {
                this.toggle(modId, false);
                this.toggle(modId, true);
            }
        }
    };

/*
8888ba.88ba                 dP                   dP                                 dP                                  dP
88  `8b  `8b                88                   88                                 88                                  88
88   88   88 .d8888b. .d888b88 .d8888b.    .d888b88 .d8888b. dP  dP  dP 88d888b.    88d888b. .d8888b. 88d888b. .d8888b.
88   88   88 88'  `88 88'  `88 Y8ooooo.    88'  `88 88'  `88 88  88  88 88'  `88    88'  `88 88ooood8 88'  `88 88ooood8
88   88   88 88.  .88 88.  .88       88    88.  .88 88.  .88 88.88b.88' 88    88    88    88 88.  ... 88       88.  ... dP
dP   dP   dP `88888P' `88888P8 `88888P'    `88888P8 `88888P' 8888P Y8P  dP    dP    dP    dP `88888P' dP       `88888P' 88

*/
    // =========================================================================
    // 📦 MOD-BIBLIOTHEK (Hier fügst du neue Mods hinzu!)
    // =========================================================================

    // 1. SCHWERKRAFT MOD (Beispiel für Settings)
    ModManager.register({
        id: 'gravity',
        name: 'Schwerkraft',
        category: 'Chaos & Zerstörung',
        description: 'Lässt alle Elemente nach unten fallen.',
        type: 'toggle',
        // Das Framework baut aus diesem Schema automatisch UI-Slider!
        settingsSchema:[
            { id: 'duration', label: 'Falldauer (Sekunden)', type: 'range', min: 1, max: 10, default: 3 }
        ],
        enable: (ctx, settings) => {
            const sec = settings.duration;
            ctx.addStyle(`
                @keyframes gFall { 0% { transform: translateY(0) rotate(0deg); } 100% { transform: translateY(120vh) rotate(360deg); opacity: 0; } }
                body > * { animation: gFall ${sec}s ease-in forwards !important; transform-origin: center !important; }
            `);
        }
    });

    // 2. DISCO MOD (Beispiel für Intervall mit Settings)
    ModManager.register({
        id: 'disco',
        name: 'Disco Google',
        category: 'Optik & Design',
        description: 'Macht Google zu einem bunten Rave.',
        type: 'toggle',
        settingsSchema:[
            { id: 'speed', label: 'Farbwechsel-Geschwindigkeit', type: 'range', min: 1, max: 50, default: 10 },
            { id: 'saturate', label: 'Farb-Intensität', type: 'range', min: 1, max: 5, default: 2 }
        ],
        enable: (ctx, settings) => {
            let h = 0;
            ctx.setInterval(() => {
                document.body.style.filter = `hue-rotate(${h}deg) saturate(${settings.saturate})`;
                h = (h + parseInt(settings.speed)) % 360;
            }, 50);
        }
    });

    // 3. FLIEHENDES SUCHFELD
    ModManager.register({
        id: 'runaway',
        name: 'Fliehendes Suchfeld',
        category: 'Chaos & Zerstörung',
        description: 'Versuche mal zu suchen... es wird schwer.',
        type: 'toggle',
        settingsSchema:[
            { id: 'distance', label: 'Fluchtdistanz (Pixel)', type: 'range', min: 50, max: 500, default: 200 }
        ],
        enable: (ctx, settings) => {
            // Permanenter Checker für dynamische Spas (Google lädt Felder oft nach)
            ctx.setInterval(() => {
                document.querySelectorAll('textarea, input[name="q"], input[type="text"]').forEach(input => {
                    if (!input.dataset.runawayMod) {
                        input.dataset.runawayMod = "true";
                        input.style.transition = 'transform 0.2s';

                        // Nutzt ctx.addEventListener (räumt sich von selbst auf!)
                        ctx.addEventListener(input, 'mouseover', () => {
                            const d = settings.distance;
                            input.style.transform = `translate(${Math.random()*d*2-d}px, ${Math.random()*d-d/2}px)`;
                        });
                    }
                });
            }, 1000);
        },
        disable: () => {
            document.querySelectorAll('textarea, input').forEach(el => {
                el.style.transform = 'none';
                delete el.dataset.runawayMod;
            });
        }
    });

    // 4. DESIGN MODE
    ModManager.register({
        id: 'designMode',
        name: 'Text bearbeiten (Word Modus)',
        category: 'Nützlich',
        description: 'Macht jeden Text auf der Seite anklickbar und überschreibbar.',
        type: 'toggle',
        enable: () => { document.designMode = "on"; },
        disable: () => { document.designMode = "off"; }
    });

    // 5. MATRIX MODUS
    ModManager.register({
        id: 'matrix',
        name: 'Matrix Regen',
        category: 'Nerd',
        description: 'Grüner Code-Regen über der Seite.',
        type: 'toggle',
        settingsSchema:[
            { id: 'color', label: 'Farbe des Codes', type: 'color', default: '#00ff00' },
            { id: 'opacity', label: 'Sichtbarkeit (1-10)', type: 'range', min: 1, max: 10, default: 5 }
        ],
        enable: (ctx, settings) => {
            const c = document.createElement('canvas');
            c.id = 'g-matrix-canvas';
            Object.assign(c.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 999998, pointerEvents: 'none', opacity: settings.opacity / 10 });
            document.documentElement.appendChild(c);

            const context = c.getContext('2d');
            const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
            resize();
            ctx.addEventListener(window, 'resize', resize);

            const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const size = 16; let cols = Math.floor(c.width / size); let drops = Array(cols).fill(1);

            ctx.setInterval(() => {
                context.fillStyle = 'rgba(0,0,0,0.05)'; context.fillRect(0,0,c.width,c.height);
                context.fillStyle = settings.color; context.font = `${size}px monospace`;
                for (let i=0; i<drops.length; i++) {
                    context.fillText(chars[Math.floor(Math.random()*chars.length)], i*size, drops[i]*size);
                    if (drops[i]*size > c.height && Math.random() > 0.95) drops[i] = 0;
                    drops[i]++;
                }
            }, 50);
        },
        disable: () => { document.getElementById('g-matrix-canvas')?.remove(); }
    });

    // 6. THANOS SNAP (AKTION)
    ModManager.register({
        id: 'thanos',
        name: 'Thanos Snap',
        category: 'Chaos & Zerstörung',
        description: 'Zerstört sofort 50% der Elemente auf dem Bildschirm.',
        type: 'action',
        execute: () => {
            document.querySelectorAll('body *').forEach(el => {
                if (Math.random() > 0.5 && el.children.length === 0 && el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT') {
                    el.style.transition = 'opacity 2s ease-out, transform 2s ease-out';
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(-20px)';
                    setTimeout(() => el.remove(), 2000);
                }
            });
        }
    });

    // 7. RESET (SYSTEM)
    ModManager.register({
        id: 'reset',
        name: '🔄 System Reset',
        category: 'System',
        description: 'Löscht alle Einstellungen und lädt die Seite neu.',
        type: 'action',
        isDanger: true,
        execute: () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    });

    // 8. DOGE INVASION (Meme-Klassiker)
    ModManager.register({
        id: 'doge',
        name: 'Doge Invasion',
        category: 'Spaß & Memes',
        description: 'Suchtfaktor: Ersetzt rigoros alle Bilder auf Google durch Doge.',
        type: 'toggle',
        enable: (ctx) => {
            const dogeUrl = 'https://upload.wikimedia.org/wikipedia/en/5/5f/Original_Doge_meme.jpg';
            // Wir nutzen ctx.setInterval, damit das Framework es beim Ausschalten stoppt
            ctx.setInterval(() => {
                document.querySelectorAll('img:not([data-doge])').forEach(img => {
                    img.src = dogeUrl;
                    if (img.srcset) img.srcset = '';
                    img.dataset.doge = 'true';
                });
            }, 800);
        }
    });

    // 9. COMIC SANS WAHNSINN
    ModManager.register({
        id: 'comicSans',
        name: 'Comic Sans',
        category: 'Optik & Design',
        description: 'Die einzig wahre Schriftart für echte Internet-Veteranen.',
        type: 'toggle',
        enable: (ctx) => {
            // ctx.addStyle wird vom Framework beim Ausschalten automatisch gelöscht!
            ctx.addStyle(`* { font-family: "Comic Sans MS", "Comic Neue", cursive !important; }`);
        }
    });

    // 10. KONFETTI KLICKS
    ModManager.register({
        id: 'confetti',
        name: 'Konfetti-Klicks',
        category: 'Optik & Design',
        description: 'Jeder Klick auf der Seite erzeugt eine kleine Konfetti-Explosion.',
        type: 'toggle',
        settingsSchema:[
            { id: 'amount', label: 'Konfetti-Menge', type: 'range', min: 5, max: 40, default: 15 }
        ],
        enable: (ctx, settings) => {
            ctx.addEventListener(window, 'click', (e) => {
                for (let i = 0; i < settings.amount; i++) {
                    const p = document.createElement('div');
                    Object.assign(p.style, {
                        position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px',
                        width: '8px', height: '8px', background: `hsl(${Math.random() * 360}, 100%, 55%)`,
                        pointerEvents: 'none', zIndex: 999999, borderRadius: Math.random() > 0.5 ? '50%' : '0'
                    });
                    document.body.appendChild(p);

                    const dx = (Math.random() - 0.5) * 300;
                    const dy = (Math.random() - 1.2) * 300;

                    p.animate([
                        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
                        { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
                    ], { duration: 700 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.2,1)' });

                    // ctx.setTimeout räumt sich selber auf
                    ctx.setTimeout(() => p.remove(), 1400);
                }
            });
        }
    });

    // 11. REGENBOGEN-MAUS (Maus-Schweif)
    ModManager.register({
        id: 'rainbowTail',
        name: 'Regenbogen-Schweif',
        category: 'Optik & Design',
        description: 'Deine Maus hinterlässt eine leuchtende Regenbogen-Spur.',
        type: 'toggle',
        enable: (ctx) => {
            ctx.addEventListener(window, 'mousemove', (e) => {
                const dot = document.createElement('div');
                Object.assign(dot.style, {
                    position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px',
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: `hsl(${Math.random() * 360}, 100%, 60%)`,
                    pointerEvents: 'none', zIndex: 999999, transform: 'translate(-50%, -50%)',
                    transition: 'all 0.4s ease-out', boxShadow: '0 0 10px currentColor'
                });
                document.body.appendChild(dot);

                requestAnimationFrame(() => {
                    dot.style.opacity = '0';
                    dot.style.transform = 'translate(-50%, -50%) scale(0.1)';
                });
                ctx.setTimeout(() => dot.remove(), 400);
            });
        }
    });

    // 12. SPOTLIGHT (Leselampe)
    ModManager.register({
        id: 'spotlight',
        name: 'Fokus Spotlight',
        category: 'Nützlich',
        description: 'Verdunkelt die Seite und beleuchtet nur den Bereich um deine Maus.',
        type: 'toggle',
        settingsSchema:[
            { id: 'radius', label: 'Lichtradius (Pixel)', type: 'range', min: 50, max: 400, default: 150 }
        ],
        enable: (ctx, settings) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `position: fixed; inset: 0; pointer-events: none; z-index: 999997; transition: background 0.1s;`;
            document.documentElement.appendChild(overlay);

            ctx.addEventListener(window, 'mousemove', (e) => {
                const r = settings.radius;
                overlay.style.background = `radial-gradient(circle ${r}px at ${e.clientX}px ${e.clientY}px, transparent 0%, rgba(0,0,0,0.85) 100%)`;
            });
            // Speichern wir im ctx, um es beim Deaktivieren manuell zu löschen
            ctx.spotlightOverlay = overlay;
        },
        disable: (ctx) => {
            if (ctx.spotlightOverlay) ctx.spotlightOverlay.remove();
        }
    });

    // 13. SUPER DARK MODE
    ModManager.register({
        id: 'superDark',
        name: 'High-Contrast Dark Mode',
        category: 'Nützlich',
        description: 'Erzwingt einen tiefschwarzen Dark-Mode via CSS-Invertierung.',
        type: 'toggle',
        settingsSchema:[
            { id: 'hue', label: 'Farbverschiebung (Hue)', type: 'range', min: 0, max: 360, default: 180 }
        ],
        enable: (ctx, settings) => {
            ctx.addStyle(`
                html { filter: invert(1) hue-rotate(${settings.hue}deg) !important; background: black !important; }
                /* Bilder und Videos zurück-invertieren, damit sie normal aussehen */
                img, video, canvas { filter: invert(1) hue-rotate(-${settings.hue}deg) !important; }
            `);
        }
    });

    // 14. ERDBEBEN
    ModManager.register({
        id: 'earthquake',
        name: 'Erdbeben',
        category: 'Chaos & Zerstörung',
        description: 'Schüttelt den gesamten Bildschirm ordentlich durch.',
        type: 'toggle',
        settingsSchema:[
            { id: 'intensity', label: 'Stärke (Richterskala)', type: 'range', min: 1, max: 20, default: 4 }
        ],
        enable: (ctx, settings) => {
            ctx.setInterval(() => {
                const int = settings.intensity;
                const x = (Math.random() * int * 2) - int;
                const y = (Math.random() * int * 2) - int;
                document.body.style.transform = `translate(${x}px, ${y}px)`;
            }, 30);
        }
    });

    // 15. BARREL ROLL (Aktion)
    ModManager.register({
        id: 'barrelRoll',
        name: 'Do a Barrel Roll',
        category: 'Spaß & Memes',
        description: 'Führt den absoluten Google-Klassiker aus.',
        type: 'action',
        execute: () => {
            document.body.style.transition = 'transform 2s ease-in-out';
            document.body.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                document.body.style.transition = '';
                document.body.style.transform = '';
            }, 2000);
        }
    });

    // 16. LINK ROULETTE (Troll)
    ModManager.register({
        id: 'linkRoulette',
        name: 'Link Roulette',
        category: 'Chaos & Zerstörung',
        description: 'Jeder Klick auf einen Link führt mit einer bestimmten Wahrscheinlichkeit zu einem Rickroll.',
        type: 'toggle',
        settingsSchema:[
            { id: 'chance', label: 'Rickroll-Wahrscheinlichkeit (%)', type: 'range', min: 1, max: 100, default: 15 }
        ],
        enable: (ctx, settings) => {
            ctx.addEventListener(document.body, 'click', (e) => {
                const link = e.target.closest('a');
                if (link && Math.random() < (settings.chance / 100)) {
                    e.preventDefault();
                    window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank');
                }
            });
        }
    });

    // 17. NETZWERK SPION (Nerd Aktion)
    ModManager.register({
        id: 'netSpy',
        name: 'Ladezeiten-Spion',
        category: 'Nerd',
        description: 'Gibt eine Nerd-Tabelle in die Konsole aus, welche Dateien wie lange geladen haben.',
        type: 'action',
        execute: () => {
            console.log("%c 🕵️‍♂️ NETZWERK SPION ", "background: #111; color: #00FF00; font-size: 20px; font-weight: bold; border-radius: 5px; padding: 5px;");
            console.table(
                performance.getEntriesByType("resource").map(r => ({
                    Ressource: (r.name.split('/').pop() || r.name).substring(0, 45) + '...',
                    Typ: r.initiatorType,
                    'Dauer (ms)': Math.round(r.duration)
                })).sort((a,b) => b['Dauer (ms)'] - a['Dauer (ms)']).slice(0, 15) // Zeigt die Top 15 langsamsten Requests
            );
            alert("Erfolgreich gescannt! Öffne die Entwicklerkonsole (F12 -> Console), um die Tabelle zu sehen.");
        }
    });

    // 18. ALLES WACKELT (Wiggle)
    ModManager.register({
        id: 'wiggle',
        name: 'Ungeduldiges Google',
        category: 'Spaß & Memes',
        description: 'Bilder, Eingabefelder und Buttons wackeln ungeduldig hin und her.',
        type: 'toggle',
        enable: (ctx) => {
            ctx.addStyle(`
                @keyframes gWiggle {
                    0%, 100% { transform: rotate(-3deg) scale(1); }
                    50% { transform: rotate(3deg) scale(1.05); }
                }
                img, button, input, .gLFyf { animation: gWiggle 0.3s infinite ease-in-out alternate !important; }
            `);
        }
    });
/*
 ██████   ██████    ███████    ██████████    █████████     ██████████ ██████   █████ ██████████
░░██████ ██████   ███░░░░░███ ░░███░░░░███  ███░░░░░███   ░░███░░░░░█░░██████ ░░███ ░░███░░░░███
 ░███░█████░███  ███     ░░███ ░███   ░░███░███    ░░░     ░███  █ ░  ░███░███ ░███  ░███   ░░███
 ░███░░███ ░███ ░███      ░███ ░███    ░███░░█████████     ░██████    ░███░░███░███  ░███    ░███
 ░███ ░░░  ░███ ░███      ░███ ░███    ░███ ░░░░░░░░███    ░███░░█    ░███ ░░██████  ░███    ░███
 ░███      ░███ ░░███     ███  ░███    ███  ███    ░███    ░███ ░   █ ░███  ░░█████  ░███    ███
 █████     █████ ░░░███████░   ██████████  ░░█████████     ██████████ █████  ░░█████ ██████████
░░░░░     ░░░░░    ░░░░░░░    ░░░░░░░░░░    ░░░░░░░░░     ░░░░░░░░░░ ░░░░░    ░░░░░ ░░░░░░░░░░

*/


    // =========================================================================
    // 🎨 UI ENGINE (Generiert das Menü, die Suchleiste und Settings)
    // =========================================================================

    // CSS für das Framework UI (gekapselt, wird ins <html> injiziert)
    const uiCSS = `
        #g-mods-container { font-family: Arial, sans-serif !important; z-index: 9999999; position: fixed; bottom: 20px; right: 20px; isolation: isolate; }

        #g-mods-toggle {
            background: #4285F4; color: white; border: none; border-radius: 50px; padding: 15px 20px;
            font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            transition: transform 0.2s; pointer-events: auto;
        }
        #g-mods-toggle:hover { transform: scale(1.05); }

        #g-mods-panel {
            position: absolute; bottom: 70px; right: 0; background: rgba(25, 25, 25, 0.95);
            backdrop-filter: blur(10px); color: #fff; border-radius: 12px; width: 340px;
            max-height: 80vh; display: flex; flex-direction: column; border: 1px solid #444;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; overflow: hidden; pointer-events: auto;
        }

        #g-mods-header { background: #202124; padding: 15px; border-bottom: 2px solid #4285F4; text-align: center; }
        #g-mods-header h2 { margin: 0; font-size: 18px; color: #fff; }

        /* Searchbar */
        #g-mods-search {
            width: 100%; box-sizing: border-box; padding: 10px; margin-top: 10px; border-radius: 6px;
            border: 1px solid #555; background: #111; color: #fff; outline: none;
        }
        #g-mods-search:focus { border-color: #4285F4; }

        #g-mods-content { overflow-y: auto; padding-bottom: 15px; flex-grow: 1; }
        #g-mods-content::-webkit-scrollbar { width: 6px; }
        #g-mods-content::-webkit-scrollbar-thumb { background: #666; border-radius: 3px; }

        .category-header { margin: 15px 15px 5px; font-size: 12px; color: #aaa; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }

        .mod-item { background: #333; margin: 5px 15px; border-radius: 8px; border: 1px solid #444; overflow: hidden; transition: 0.2s; }
        .mod-item.active-mod { border-color: #34A853; background: #2a3a2a; }
        .mod-item.danger-mod { border-color: #EA4335; }

        .mod-main { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; cursor: pointer; }
        .mod-main:hover { background: rgba(255,255,255,0.05); }

        .mod-info { flex-grow: 1; }
        .mod-name { font-size: 14px; font-weight: bold; margin-bottom: 3px; }
        .mod-desc { font-size: 11px; color: #999; }

        /* Settings Button (Zahnrad) */
        .mod-settings-btn { background: none; border: none; color: #aaa; font-size: 16px; cursor: pointer; padding: 5px; margin-left: 10px; transition: transform 0.2s; }
        .mod-settings-btn:hover { color: #fff; transform: rotate(90deg); }

        /* Settings Panel (ausklappbar) */
        .mod-settings-panel { background: #222; border-top: 1px solid #444; padding: 10px; display: none; }
        .setting-row { margin-bottom: 10px; display: flex; flex-direction: column; }
        .setting-row:last-child { margin-bottom: 0; }
        .setting-row label { font-size: 11px; color: #ccc; margin-bottom: 5px; display: flex; justify-content: space-between;}
        .setting-row input[type=range] { width: 100%; accent-color: #4285F4; }
        .setting-row input[type=color] { width: 100%; height: 30px; border: none; cursor: pointer; border-radius: 4px; }
    `;

    // UI Initialisierung
    const initUI = () => {
        const style = document.createElement('style');
        style.innerHTML = uiCSS;
        document.documentElement.appendChild(style); // Sicher im HTML platzieren

        const container = document.createElement('div');
        container.id = 'g-mods-container';
        container.innerHTML = `
            <div id="g-mods-panel">
                <div id="g-mods-header">
                    <h2>🧪 G-Mods Framework V3</h2>
                    <input type="text" id="g-mods-search" placeholder="🔍 Suche nach Mods...">
                </div>
                <div id="g-mods-content"></div>
            </div>
            <button id="g-mods-toggle">⚙️ G-Mods</button>
        `;
        document.documentElement.appendChild(container);

        const toggleBtn = document.getElementById('g-mods-toggle');
        const panel = document.getElementById('g-mods-panel');
        const content = document.getElementById('g-mods-content');
        const searchBar = document.getElementById('g-mods-search');

        // Panel auf/zu
        toggleBtn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
            if (panel.style.display === 'flex') searchBar.focus();
        });

        // Generiere UI-Liste aus der Mod-Registry
        const categories = {};
        Array.from(ModManager.registry.values()).forEach(mod => {
            if (!categories[mod.category]) categories[mod.category] = [];
            categories[mod.category].push(mod);
        });

        // Baut das DOM für eine einzelne Mod
        const buildModDOM = (mod) => {
            const wrap = document.createElement('div');
            wrap.className = `mod-item ${state.activeMods.includes(mod.id) ? 'active-mod' : ''} ${mod.isDanger ? 'danger-mod' : ''}`;
            wrap.dataset.name = mod.name.toLowerCase();
            wrap.dataset.desc = (mod.description || '').toLowerCase();

            // Main Clickable Area
            const main = document.createElement('div');
            main.className = 'mod-main';
            main.innerHTML = `
                <div class="mod-info">
                    <div class="mod-name">${mod.name}</div>
                    <div class="mod-desc">${mod.description || ''}</div>
                </div>
            `;

            // Toggle Logik (An/Aus Klick)
            main.addEventListener('click', () => {
                ModManager.toggle(mod.id);
                if (mod.type === 'toggle') {
                    wrap.classList.toggle('active-mod', state.activeMods.includes(mod.id));
                }
            });
            wrap.appendChild(main);

            // Falls Settings existieren, baue das Settings-Panel
            if (mod.settingsSchema && mod.settingsSchema.length > 0) {
                const settingsBtn = document.createElement('button');
                settingsBtn.className = 'mod-settings-btn';
                settingsBtn.innerHTML = '⚙️';
                main.appendChild(settingsBtn); // Fügt Zahnrad hinzu

                const settingsPanel = document.createElement('div');
                settingsPanel.className = 'mod-settings-panel';

                mod.settingsSchema.forEach(schema => {
                    const row = document.createElement('div');
                    row.className = 'setting-row';
                    const currentValue = state.modSettings[mod.id][schema.id];

                    let inputHtml = '';
                    if (schema.type === 'range') {
                        inputHtml = `<input type="range" min="${schema.min}" max="${schema.max}" value="${currentValue}">`;
                    } else if (schema.type === 'color') {
                        inputHtml = `<input type="color" value="${currentValue}">`;
                    }

                    row.innerHTML = `
                        <label>${schema.label} <span class="val-display">${schema.type === 'range' ? currentValue : ''}</span></label>
                        ${inputHtml}
                    `;

                    // Live Update Event
                    const input = row.querySelector('input');
                    const display = row.querySelector('.val-display');
                    input.addEventListener('input', (e) => {
                        const val = e.target.value;
                        if (display && schema.type === 'range') display.innerText = val;
                        ModManager.updateSetting(mod.id, schema.id, val);
                    });

                    settingsPanel.appendChild(row);
                });

                wrap.appendChild(settingsPanel);

                // Zahnrad klick -> Settings aufklappen (stoppt propagation zum Haupt-Button)
                settingsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
                });
            }

            return wrap;
        };

        // UI füllen
        Object.keys(categories).forEach(catName => {
            const catWrapper = document.createElement('div');
            catWrapper.className = 'category-group';

            const header = document.createElement('div');
            header.className = 'category-header';
            header.innerText = catName;
            catWrapper.appendChild(header);

            categories[catName].forEach(mod => {
                catWrapper.appendChild(buildModDOM(mod));
            });

            content.appendChild(catWrapper);
        });

        // Such-Logik
        searchBar.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.category-group').forEach(group => {
                let hasVisible = false;
                group.querySelectorAll('.mod-item').forEach(item => {
                    const match = item.dataset.name.includes(term) || item.dataset.desc.includes(term);
                    item.style.display = match ? 'block' : 'none';
                    if (match) hasVisible = true;
                });
                group.style.display = hasVisible ? 'block' : 'none';
            });
        });
    };

    // =========================================================================
    // 🚀 BOOTUP SEQUENZ
    // =========================================================================
    initUI();

    // Re-aktiviere alle gespeicherten Mods beim Seitenaufruf
    state.activeMods.forEach(modId => {
        // Wir entfernen es erst aus dem Array und rufen toggle() auf, damit der normale Flow greift
        state.activeMods = state.activeMods.filter(id => id !== modId);
        ModManager.toggle(modId, true);
    });

})();
