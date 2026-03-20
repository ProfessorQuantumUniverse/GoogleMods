// ==UserScript==
// @name         Google Ultimate Framework V4
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Ein robustes, modulares Framework für Google-Mods mit Searchbar, Toast-Benachrichtigungen, Tastenkürzel und Settings.
// @author       ProfessorQuantumUniverse
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
            this.timeouts = [];
            this.listeners = [];
            this.styles = [];
            this.elements = []; // Für ctx.createElement() erzeugte DOM-Elemente
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
        // options: optionaler vierter Parameter (z.B. { passive: false } für wheel-Events)
        addEventListener(target, event, fn, options) {
            const opts = options !== undefined ? options : false;
            target.addEventListener(event, fn, opts);
            this.listeners.push({ target, event, fn, opts });
        }

        // Injiziert CSS ins Dokument und merkt es sich
        addStyle(cssString) {
            const style = document.createElement('style');
            style.id = `gmod-style-${this.modId}-${this.styles.length}`;
            style.innerHTML = cssString;
            document.head.appendChild(style);
            this.styles.push(style);
        }

        // Erstellt ein DOM-Element, hängt es an parent an und verfolgt es für das Cleanup
        createElement(tag, parent) {
            const el = document.createElement(tag);
            const target = parent || document.body;
            target.appendChild(el);
            this.elements.push(el);
            return el;
        }

        // Räumt rigoros alles ab, was die Mod gestartet hat
        cleanup() {
            this.intervals.forEach(clearInterval);
            this.timeouts.forEach(clearTimeout);
            this.listeners.forEach(l => l.target.removeEventListener(l.event, l.fn, l.opts));
            this.styles.forEach(s => s.remove());
            this.elements.forEach(el => el.remove());

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
        _onToggle: null, // UI-Callback: wird nach jedem Toggle aufgerufen

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

            // UI benachrichtigen (z.B. Badge aktualisieren, Toast anzeigen)
            if (this._onToggle) this._onToggle(modId, state.activeMods.includes(modId), mod);
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

    // ── OPTIK & DESIGN ────────────────────────────────────────────────────────

    // 19. NIGHT LIGHT
    ModManager.register({
        id: 'nightLight',
        name: 'Night Light',
        category: 'Optik & Design',
        description: 'Legt einen warmen Gelbfilter über die Seite. Schont die Augen bei Nacht.',
        type: 'toggle',
        settingsSchema: [
            { id: 'warmth', label: 'Wärme', type: 'range', min: 1, max: 10, default: 5 }
        ],
        enable: (ctx, settings) => {
            const s = parseInt(settings.warmth);
            ctx.addStyle(`html { filter: sepia(${s * 0.05}) saturate(1.1) brightness(${1 - s * 0.015}) !important; }`);
        }
    });

    // 20. GROSSSCHRIFT
    ModManager.register({
        id: 'bigText',
        name: 'Grossschrift',
        category: 'Optik & Design',
        description: 'Vergrössert alle Schriften auf der Seite – nützlich bei kleinen Bildschirmen.',
        type: 'toggle',
        settingsSchema: [
            { id: 'scale', label: 'Schriftgrösse (%)', type: 'range', min: 110, max: 200, default: 140 }
        ],
        enable: (ctx, settings) => {
            ctx.addStyle(`html { font-size: ${settings.scale}% !important; }`);
        }
    });

    // 21. SLOW MOTION
    ModManager.register({
        id: 'slowMotion',
        name: 'Slow Motion',
        category: 'Optik & Design',
        description: 'Verlangsamt alle CSS-Animationen und Übergänge auf der Seite drastisch.',
        type: 'toggle',
        settingsSchema: [
            { id: 'factor', label: 'Verlangsamungs-Faktor', type: 'range', min: 2, max: 20, default: 5 }
        ],
        enable: (ctx, settings) => {
            const f = parseInt(settings.factor);
            ctx.addStyle(`
                *, *::before, *::after {
                    animation-duration: ${f * 500}ms !important;
                    animation-delay: 0ms !important;
                    transition-duration: ${f * 200}ms !important;
                }
                #g-mods-container, #g-mods-container * {
                    animation-duration: initial !important;
                    transition-duration: initial !important;
                }
            `);
        }
    });

    // ── NÜTZLICH ──────────────────────────────────────────────────────────────

    // 22. LESE-MODUS
    ModManager.register({
        id: 'readingMode',
        name: 'Lese-Modus',
        category: 'Nützlich',
        description: 'Blendet Werbung, Sidebars und Ablenkungen aus. Zentriert den Inhalt auf 750 Pixel.',
        type: 'toggle',
        enable: (ctx) => {
            ctx.addStyle(`
                #rhs, #tads, .ads-ad, [data-text-ad], .commercial-unit-desktop-rhs,
                #bottomads, .TBC8ub, .u3A9Ac { display: none !important; }
                #main, #center_col, #rcnt { max-width: 750px !important; margin: 0 auto !important; float: none !important; }
                body { background: #f5f5f0 !important; }
            `);
        }
    });

    // 23. SCROLL-TEMPO
    ModManager.register({
        id: 'scrollEnhancer',
        name: 'Scroll-Tempo',
        category: 'Nützlich',
        description: 'Stellt die Scrollgeschwindigkeit der Mausrolle individuell ein.',
        type: 'toggle',
        settingsSchema: [
            { id: 'multiplier', label: 'Geschwindigkeit (Vielfaches)', type: 'range', min: 1, max: 8, default: 3 }
        ],
        enable: (ctx, settings) => {
            const handler = (e) => {
                e.preventDefault();
                window.scrollBy({ top: e.deltaY * parseInt(settings.multiplier), behavior: 'auto' });
            };
            ctx.addEventListener(document, 'wheel', handler, { passive: false });
        }
    });

    // 24. EIGENES CSS
    ModManager.register({
        id: 'customCSS',
        name: 'Eigenes CSS',
        category: 'Nützlich',
        description: 'Injiziert beliebiges CSS in die Seite. Für fortgeschrittene Nutzer.',
        type: 'toggle',
        settingsSchema: [
            { id: 'css', label: 'CSS-Code', type: 'textarea', default: '/* body { background: #1a1a2e !important; } */' }
        ],
        enable: (ctx, settings) => {
            const code = (settings.css || '').trim();
            if (code) ctx.addStyle(code);
        }
    });

    // ── NERD ──────────────────────────────────────────────────────────────────

    // 25. FPS-ZÄHLER
    ModManager.register({
        id: 'fpsCounter',
        name: 'FPS-Zähler',
        category: 'Nerd',
        description: 'Zeigt die aktuelle Bildwiederholrate (FPS) des Browsers live in der Ecke an.',
        type: 'toggle',
        enable: (ctx) => {
            const display = ctx.createElement('div', document.documentElement);
            Object.assign(display.style, {
                position: 'fixed', top: '10px', left: '10px', background: 'rgba(0,0,0,0.8)',
                color: '#00ff00', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold',
                padding: '5px 10px', borderRadius: '5px', zIndex: '9999998',
                pointerEvents: 'none', userSelect: 'none'
            });
            let frames = 0, active = true;
            const tick = () => { if (!active) return; frames++; requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
            ctx.setInterval(() => { display.textContent = `${frames} FPS`; frames = 0; }, 1000);
            ctx._stopFPS = () => { active = false; };
        },
        disable: (ctx) => { if (ctx._stopFPS) ctx._stopFPS(); }
    });

    // 26. COOKIE-INSPEKTOR
    ModManager.register({
        id: 'cookiePeek',
        name: 'Cookie-Inspektor',
        category: 'Nerd',
        description: 'Zeigt alle Cookies dieser Seite als Tabelle in der Browserkonsole an.',
        type: 'action',
        execute: () => {
            const raw = document.cookie;
            const cookies = raw ? raw.split('; ').map(c => {
                const idx = c.indexOf('=');
                return { Name: c.slice(0, idx), Wert: c.slice(idx + 1, idx + 61) + (c.length > idx + 61 ? '…' : '') };
            }) : [];
            if (!cookies.length) { alert('Keine Cookies auf dieser Seite vorhanden.'); return; }
            console.log('%c Cookie-Inspektor ', 'background:#4285F4;color:white;font-size:18px;padding:4px;border-radius:4px;');
            console.table(cookies);
            alert(`${cookies.length} Cookie(s) gefunden. Details in der Konsole (F12 → Console).`);
        }
    });

    // 27. X-RAY MODUS
    ModManager.register({
        id: 'xrayMode',
        name: 'X-Ray Modus',
        category: 'Nerd',
        description: 'Zeichnet farbige Umrandungen um alle DOM-Elemente. Ideal für Layout-Debugging.',
        type: 'toggle',
        enable: (ctx) => {
            ctx.addStyle(`
                * { outline: 1px dashed rgba(255,0,0,0.5) !important; }
                * * { outline-color: rgba(0,200,0,0.5) !important; }
                * * * { outline-color: rgba(30,144,255,0.6) !important; }
                * * * * { outline-color: rgba(255,165,0,0.5) !important; }
                * * * * * { outline-color: rgba(180,0,255,0.5) !important; }
                #g-mods-container, #g-mods-container * { outline: none !important; }
            `);
        }
    });

    // 28. TASTEN-ANZEIGE
    ModManager.register({
        id: 'keyVisualizer',
        name: 'Tasten-Anzeige',
        category: 'Nerd',
        description: 'Zeigt jeden Tastendruck gross in der Bildschirmmitte an.',
        type: 'toggle',
        enable: (ctx) => {
            const display = ctx.createElement('div', document.documentElement);
            Object.assign(display.style, {
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                background: 'rgba(0,0,0,0.78)', color: '#fff', fontFamily: 'monospace',
                fontSize: '52px', fontWeight: 'bold', padding: '18px 28px', borderRadius: '12px',
                zIndex: '9999998', pointerEvents: 'none', opacity: '0',
                transition: 'opacity 0.15s ease', minWidth: '80px', textAlign: 'center',
                boxShadow: '0 6px 30px rgba(0,0,0,0.6)'
            });
            let hideTimer = null;
            ctx.addEventListener(document, 'keydown', (e) => {
                if (e.key === 'Escape') return;
                display.textContent = e.key.length === 1 ? e.key : `[${e.key}]`;
                display.style.opacity = '1';
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(() => { display.style.opacity = '0'; }, 900);
            });
        }
    });

    // ── SPASS & MEMES ─────────────────────────────────────────────────────────

    // 29. AUF DEM KOPF
    ModManager.register({
        id: 'flipped',
        name: 'Auf dem Kopf',
        category: 'Spaß & Memes',
        description: 'Dreht die gesamte Seite auf den Kopf. Für echte Hartgesottene.',
        type: 'toggle',
        enable: (ctx) => {
            ctx.addStyle(`
                html { transform: rotate(180deg) !important; transform-origin: center center !important; }
                #g-mods-container { transform: rotate(180deg) !important; }
            `);
        }
    });

    // 30. SCHNEEFALL
    ModManager.register({
        id: 'snowfall',
        name: 'Schneefall',
        category: 'Spaß & Memes',
        description: 'Lässt sanft Schneeflocken über die Seite fallen.',
        type: 'toggle',
        settingsSchema: [
            { id: 'amount', label: 'Schneemenge', type: 'range', min: 20, max: 200, default: 80 }
        ],
        enable: (ctx, settings) => {
            const container = ctx.createElement('div', document.documentElement);
            container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999998;overflow:hidden;';
            ctx.addStyle(`
                @keyframes gSnowFall {
                    0%   { transform: translateY(-12px) translateX(0); opacity: 0.9; }
                    100% { transform: translateY(102vh) translateX(var(--drift,0px)); opacity: 0.2; }
                }
                .g-snowflake {
                    position: absolute; top: -12px; border-radius: 50%;
                    background: white; pointer-events: none;
                    animation: gSnowFall linear infinite;
                }
            `);
            for (let i = 0; i < parseInt(settings.amount); i++) {
                const flake = document.createElement('div');
                flake.className = 'g-snowflake';
                const size = 3 + Math.random() * 5;
                const drift = (Math.random() - 0.5) * 140;
                flake.style.cssText = `
                    left:${Math.random() * 100}%;
                    width:${size}px; height:${size}px;
                    opacity:${0.4 + Math.random() * 0.6};
                    animation-duration:${4 + Math.random() * 7}s;
                    animation-delay:${-Math.random() * 10}s;
                    --drift:${drift}px;
                `;
                container.appendChild(flake);
            }
        }
    });

    // 31. FEUERWERK
    ModManager.register({
        id: 'fireworks',
        name: 'Feuerwerk',
        category: 'Spaß & Memes',
        description: 'Jeder Klick auf die Seite zündet ein buntes Feuerwerk.',
        type: 'toggle',
        settingsSchema: [
            { id: 'sparks', label: 'Funken pro Klick', type: 'range', min: 10, max: 60, default: 30 }
        ],
        enable: (ctx, settings) => {
            const colors = ['#FF5733','#FFC300','#DAF7A6','#C70039','#9B59B6','#3498DB','#2ECC71','#FF69B4'];
            ctx.addEventListener(window, 'click', (e) => {
                const count = parseInt(settings.sparks);
                for (let i = 0; i < count; i++) {
                    const spark = document.createElement('div');
                    const angle = (Math.PI * 2 / count) * i;
                    const speed = 70 + Math.random() * 130;
                    Object.assign(spark.style, {
                        position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px',
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: colors[Math.floor(Math.random() * colors.length)],
                        pointerEvents: 'none', zIndex: '999999',
                        transform: 'translate(-50%,-50%)'
                    });
                    document.body.appendChild(spark);
                    const dx = Math.cos(angle) * speed;
                    const dy = Math.sin(angle) * speed;
                    spark.animate([
                        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 }
                    ], { duration: 550 + Math.random() * 400, easing: 'cubic-bezier(0,.9,.57,1)' });
                    ctx.setTimeout(() => spark.remove(), 1000);
                }
            });
        }
    });

    // ── CHAOS & ZERSTÖRUNG ────────────────────────────────────────────────────

    // 32. ZOOM-PULS
    ModManager.register({
        id: 'zoomPulse',
        name: 'Zoom-Puls',
        category: 'Chaos & Zerstörung',
        description: 'Lässt die Seite rhythmisch ein- und auszoomen.',
        type: 'toggle',
        settingsSchema: [
            { id: 'speed', label: 'Puls-Geschwindigkeit', type: 'range', min: 1, max: 10, default: 3 }
        ],
        enable: (ctx, settings) => {
            const dur = Math.max(300, 1200 - parseInt(settings.speed) * 100);
            ctx.addStyle(`
                @keyframes gZoomPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
                body { animation: gZoomPulse ${dur}ms ease-in-out infinite !important; transform-origin: center top !important; }
            `);
        }
    });

    // 33. CURSOR-CHAOS
    ModManager.register({
        id: 'cursorChaos',
        name: 'Cursor-Chaos',
        category: 'Chaos & Zerstörung',
        description: 'Jedes Element bekommt beim Hovern einen anderen, zufälligen Maus-Cursor zugewiesen.',
        type: 'toggle',
        enable: (ctx) => {
            const cursors = ['crosshair','wait','grab','zoom-in','zoom-out','not-allowed','cell','copy','move','help','progress','alias','context-menu','vertical-text'];
            let idx = 0;
            ctx.addEventListener(document.body, 'mouseover', (e) => {
                e.target.style.cursor = cursors[idx % cursors.length];
                idx++;
            });
        },
        disable: () => {
            document.querySelectorAll('*').forEach(el => { if (el.style.cursor) el.style.cursor = ''; });
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
        .setting-row textarea {
            width: 100%; box-sizing: border-box; resize: vertical; background: #111; color: #ccc;
            border: 1px solid #555; border-radius: 4px; padding: 6px; font-family: monospace;
            font-size: 11px; min-height: 70px;
        }
        .setting-row textarea:focus { border-color: #4285F4; outline: none; }

        /* Toast-Benachrichtigungen */
        .g-toast {
            position: fixed; bottom: 85px; right: 20px; padding: 10px 16px;
            border-radius: 8px; font-family: Arial, sans-serif; font-size: 13px;
            font-weight: bold; color: #fff; z-index: 99999999; opacity: 0;
            transform: translateY(8px); pointer-events: none;
            transition: opacity 0.25s ease, transform 0.25s ease;
            box-shadow: 0 4px 14px rgba(0,0,0,0.45); max-width: 260px; line-height: 1.4;
        }
        .g-toast.show { opacity: 1; transform: translateY(0); }
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
                    <h2>G-Mods Framework V4</h2>
                    <input type="text" id="g-mods-search" placeholder="Mod suchen...">
                </div>
                <div id="g-mods-content"></div>
            </div>
            <button id="g-mods-toggle">G-Mods</button>
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

        // Escape-Taste schliesst das Panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.style.display === 'flex') panel.style.display = 'none';
        });

        // Toast-Benachrichtigung anzeigen
        const showToast = (msg, type) => {
            const bgMap = { success: '#34A853', info: '#4285F4', warn: '#FBBC05', error: '#EA4335' };
            const t = document.createElement('div');
            t.className = 'g-toast';
            t.textContent = msg;
            t.style.background = bgMap[type] || bgMap.info;
            document.documentElement.appendChild(t);
            requestAnimationFrame(() => { requestAnimationFrame(() => { t.classList.add('show'); }); });
            setTimeout(() => {
                t.classList.remove('show');
                setTimeout(() => t.remove(), 300);
            }, 2400);
        };

        // Aktive-Mod-Anzeige im Toggle-Button
        const updateBadge = () => {
            const count = state.activeMods.length;
            toggleBtn.textContent = count > 0 ? `G-Mods [${count}]` : 'G-Mods';
            toggleBtn.style.background = count > 0 ? '#34A853' : '#4285F4';
        };
        updateBadge();

        // ModManager-Callback: UI nach jedem Toggle aktualisieren
        ModManager._onToggle = (modId, isNowOn, mod) => {
            if (mod && mod.type === 'toggle') {
                showToast(isNowOn ? `${mod.name} aktiviert` : `${mod.name} deaktiviert`, isNowOn ? 'success' : 'info');
            }
            updateBadge();
        };

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
                    } else if (schema.type === 'textarea') {
                        const escaped = String(currentValue).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                        inputHtml = `<textarea rows="4">${escaped}</textarea>`;
                    }

                    row.innerHTML = `
                        <label>${schema.label} <span class="val-display">${schema.type === 'range' ? currentValue : ''}</span></label>
                        ${inputHtml}
                    `;

                    // Live Update Event
                    const input = row.querySelector('input, textarea');
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
