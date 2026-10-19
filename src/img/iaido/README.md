# Ассеты иайдо 居合

Сейчас здесь заглушки, нарисованные кодом (`python scripts/iaido-assets.py`; с `--force` перерисует их заново).
Чтобы заменить заглушку, положи файл с тем же именем. Код ничего больше не требует, но **размеры и пропорции важны**:
самурай стоит в процентах от картины, а катана прячется в ножны по проценту высоты.

Все шесть картинок есть в очереди генератора (закладка «Очередь» → «Взять» → «В игру»). Генерировать удобно в «Пиксель-арт.bat» (Nano Banana): спрайты на пурпурном фоне `#FF00FF`, фон вырезается сам.
Большие картины прогоняй через `python scripts/pixelart.py вход.png src/img/iaido/bg.png --cell 4`,
чтобы мыльные пиксели стали чёткими.

| Файл | Где | Размер (в пикселях арта) | Важно |
|---|---|---|---|
| `bg.png` | ТВ во весь экран + фон телефона | 16:9, родная сетка ~480×270 (исходник 1920×1080) | без людей: самурай отдельным слоем. Луна правее центра (на телефоне кадр режется по ней: `object-position: 62%`) |
| `samurai.png` | ТВ, пока ждут сигнала | квадрат, ~96×96, прозрачный фон | стойка: рука на рукояти, меч в ножнах. Ноги у нижнего края |
| `samurai_cut.png` | ТВ после 斬 | тот же квадрат, та же точка опоры | меч выхвачен, удар вперёд-вверх. Ноги в тех же пикселях, что в `samurai.png`, иначе фигура прыгнет |
| `petal.png` | лепестки на ТВ и телефоне | крошечный, ~7×5, прозрачный | один лепесток сакуры, 2–3 оттенка розового |
| `katana.png` | кнопка на телефоне | вертикально, 1:10 (~16×160), прозрачный | рукоять вверху. **Низ цубы (гарды) — ровно на 25% высоты**, ниже — клинок до самого низа |
| `saya.png` | кнопка на телефоне | та же ширина, высота = 75% катаны (~16×120) | ножны вертикально, устье вверху. Непрозрачные: прячут клинок |

Если пропорции меча выйдут другими — поправь `.iai-saya { top: 25%; height: 75% }` и `aspect-ratio` у `.iai-sword` в `src/styles/play.css`.
Место самурая на картине — `.iai-sam` в `src/styles/tv.css` (сейчас `left: 35.4%; top: 63%`, ширина 20% картины).

## Промпты (Nano Banana)

**bg.png**
> Pixel art, 16:9 wide landscape, night in feudal Japan. A huge full moon slightly right of center with a soft glow,
> silhouette of Mount Fuji beneath it, a blooming sakura tree on the left edge with branches reaching over the top,
> another sakura branch entering from the top right corner, a dark grassy field in the foreground with fallen petals.
> Deep indigo-to-violet sky with stars, pink blossoms, very atmospheric and calm. Empty center-bottom area for a character.
> No people, no text. Limited palette, crisp pixels, 16-bit era.

**samurai.png**
> Pixel art sprite, a lone ronin samurai in solid dark silhouette seen from behind at three-quarters, low iaido stance,
> right hand resting on the katana hilt, sword sheathed at the left hip, topknot, wide hakama trousers.
> Full body, feet at the bottom edge. On a perfectly flat solid magenta #FF00FF background.

**samurai_cut.png**
> Same ronin samurai silhouette, same pose of the legs and same position, but the katana has just been drawn:
> arm extended forward and up, a bright white gleaming blade. On a perfectly flat solid magenta #FF00FF background.

**petal.png**
> Pixel art, a single tiny sakura petal, 3 shades of pink, on a perfectly flat solid magenta #FF00FF background.

**katana.png**
> Pixel art, a Japanese katana standing perfectly vertical, hilt at the top: white wrapped tsuka with black diamond
> pattern, gold kashira, gold tsuba (guard) at one quarter of the height, then a long polished steel blade with
> a subtle hamon down to the tip at the bottom. Straight, centered, no perspective.
> On a perfectly flat solid magenta #FF00FF background.

**saya.png**
> Pixel art, an empty katana scabbard (saya) standing perfectly vertical, opening at the top: glossy red lacquer,
> black koiguchi at the mouth, a cream sageo cord near the top, gold kojiri cap at the bottom. Straight, centered.
> On a perfectly flat solid magenta #FF00FF background.
