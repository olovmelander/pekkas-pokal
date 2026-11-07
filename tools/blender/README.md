# Blender-verktyg

Keramikerns hår och basker i Pekkas Lerskulptur (2026) är modellerade i
**Blender 5.2** via Python-modulen `bpy`, anpassade efter hennes eget huvud
från personsystemet (`src/games/shared/people.js`). Resultatet är
`src/games/clay/keramikern.glb`, som spelet laddar och skinnar mot hennes
skelett (`loadKeramikerLook` i `src/games/clay/keramiker.js`).

Så genereras filen om:

```sh
python3 -m venv .venv-blender && .venv-blender/bin/pip install bpy==5.2.3
node tools/blender/export-ref.mjs                    # hennes kropp i vilopose -> tools/blender/ref/
.venv-blender/bin/python tools/blender/keramiker_hair.py   # -> src/games/clay/keramikern.glb
.venv-blender/bin/python tools/blender/preview.py check    # valfritt: Cycles-bilder framifrån, från sidan och bakifrån
```

Ändras hennes utseende i `LOOK` (längd, ansikte, kroppsbyggnad) ska filen
genereras om, så att håret fortsätter att sitta på huvudet.
