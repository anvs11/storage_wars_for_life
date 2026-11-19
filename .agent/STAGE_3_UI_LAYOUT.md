# Stage 3 · Раскладка У2 перед подключением контракта

Локальный макет открывается по адресу http://127.0.0.1:5174/src/ui/stage3-layout.html после запуска Vite из корня. Рабочая основа — `202937c` из `origin/main`. Суммы и переходы в макете заданы примерами. После передачи контракта их заменят `Stage3View` и командами с ревизией.

На 360×640 банк, шкала и все три класса торгов помещаются в первом экране. Под ними идут досуг, улучшения и аэропорт. На 1280×900 банк и шкала занимают верхнюю строку. Слева расположены торги и аэропорт, справа — цены занятий и прирост рейтинга. Пример с $42 и 8 очками показывает три разных состояния торгов. Обычные доступны со стартом $20, для отборных с порогом 8 не хватает $8 на первую ставку $50, а антикварные откроются при 18 очках.

Для доступного лота основное действие — «Осмотреть гараж», для обычного лота при недостатке денег — «Восстановить банк», на квитанции — «К аукционам». На закрытой карточке видна причина. «Откроется при 18 очках» относится к рейтингу, «Не хватает денег на ставку» к банку, «Уже куплено» к улучшению. После последнего порога шкала показывает «Все классы торгов открыты». Цены и пороги в игровом экране берём из контракта У1.

Маршрут макета аэропорта — «Позвонить в аэропорт» → «Купить за $25» или «Вернуться к торгам». После покупки оставляется карточка закрытого чемодана и «Открыть». После открытия появляются находка и цена продажи. Квитанция показывает цену покупки, выручку, убыток и итоговый банк. Дешёвый исход макета даёт $42 → $17 → $21. Для нехватки денег запланирована строка «Нужно $25 для покупки» и доступный возврат. Дорогой исход и фактические суммы проверяются после получения примеров У1.

## Иллюстрации

Созданы встроенным ImageGen, сохранены в JPEG 1536×1024. Названия и альтернативный текст прописаны в `src/ui/garage-scenes.ts`. Обе сцены оставляют открытое место для находок из каталога.

### `src/ui/assets/garage-selected.jpg`

> Original location background for a photorealistic indie auction browser game, landscape 3:2, viewed from just outside an open roll-up door. A clean mid-tier storage garage, notably different from a home garage or masonry workshop: blue-gray painted corrugated steel interior, pale smooth concrete, a high frosted window spills an angled band of daylight from the left, narrow fixed empty metal rack on back right. Leave the entire center and foreground empty and clearly visible for separately rendered dynamic auction items. Architectural details only. Grounded cinematic editorial photography, muted slate blue and desaturated grays with natural warm light. No merchandise, vehicles, boxes, antiques, tools, signs, text, logos, people, or watermark.

### `src/ui/assets/garage-antiques.jpg`

> Original location background for a photorealistic indie auction browser game, landscape 3:2, front threshold view into a premium auction storage bay converted from an old brick carriage house. Warm russet exposed brick, tall dark timber lintel, aged stone floor, one fixed empty shallow wall recess, warm low wall lights and soft indirect daylight from the raised entrance. Character comes only from historic architecture. Large clear center floor and open side areas for separately rendered dynamic auction lots. Cinematic editorial photography matching an understated working-class storage game, realistic stone and timber texture. No displayed objects, furniture, antiques, cloth, boxes, signs, text, logos, people or watermark.
