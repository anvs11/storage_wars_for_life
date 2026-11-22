# Stage 6 · Каталог, вместимость, ремонт и багаж

## Изменения и сохранения

Новые лоты получают генератор Stage 6. Для уже открытого лота v4 сохраняется генератор Stage 5. v1–v3 по-прежнему читаются через прежние декодеры. Первый подтверждённый ход после загрузки записывает v5. В новый снимок входят версия лота, оплаченные расширения, выбранный груз, факт получения чемодана, встречный ответ, заказ с доставкой и затраты на ремонт.

У гаража 8 мест, после покупки расширения за 11 000 ₽ — 16. У машины 4, после покупки за 18 000 ₽ — 8. В шкатулке отдельные 4 места, украшения занимают место в машине при вывозе. Покупки вместимости отделены от сюжетных улучшений. Сюжетное улучшение дома меняет фон чемодана на паркет. В базовом доме используются потёртые доски или камень, выбранные при покупке чемодана по сохранённому seed.

Предложение ремонта показывает цену и будущий диапазон. Ремонт повреждённого чайника в контрольной партии стоит 500 ₽, ожидаемая стоимость после ремонта 3 600–5 000 ₽. Он отзывает старое объявление. Квитанция показывает закупку и ремонт отдельно. По одному отклику можно сделать одно встречное предложение в пределах цены объявления. При подходящей цене есть шанс получить заказ с доставкой. Отправка через подтверждение использует то же разовое зачисление, что обычная продажа.

## Проверка и контрольные суммы

На Chrome 157 под Windows пройдены 360×640 с эмуляцией касания и 1280×900 мышью и клавиатурой. Свежий профиль повторил учебную покупку и перепродажу, банк 0 → 3 350 → 350 → 3 850 ₽. Первый отклик закрыт за 0,15 и 0,12 с автоматизированного ввода после загрузки. Из тестового профиля с 50 000 ₽ обе покупки вместимости оставили 21 000 ₽ и пережили перезагрузку. Ремонт оставил 20 500 ₽. После встречного ответа выручка уменьшена в квитанции на 1 000 ₽ закупки и 500 ₽ ремонта. Прошли 92 теста, сборка и прогон на её предварительном просмотре. Сценарии с расширениями, ремонтом и багажом начинались с контрольного снимка, чтобы воспроизвести одни и те же цены и варианты пола.

При покупке багажа за 2 400 ₽ банк 50 000 → 47 600 ₽. Перезагрузка восстановила курьера до получения и показанные находки после вскрытия. В кадре только чемодан, пол и кнопки найденных вещей. На доске зафиксирован заказ с доставкой за 300 ₽, подтверждение оставило 47 900 ₽ и итог −2 100 ₽. Цена чемодана вошла в себестоимость, рейтинга за неё нет. Тестами проверены миграция открытого лота, повторная покупка, устаревший отклик, повторная продажа и сохранение груза. Физический телефон в этой проверке не использовался.

## Баланс

На каждой из двух выборок с seed 1966776064 и 2833539010 проверено по 3 000 лотов каждого класса. Обе стратегии выбирали груз по оценочной цене на единицу объёма при 4 местах машины. Первая всегда торговалась до выигрыша. Вторая применяла предел по видимым диапазонам, классовой оценке закрытых мест и резерву 15%. Процент украшений измерен среди скрытых предметов. Средняя прибыль включает пасы с нулевым результатом. В антикварных торгах после первого прогона повышена оценка закрытого места соперником до 16 500 ₽.

| Класс | Украшения, основная / отложенная | Доход с купленных лотов после перевозки, минимум–максимум на основной | Средняя прибыль при покупке всех, основная / отложенная | Средняя прибыль при выборе, основная / отложенная |
|---|---:|---:|---:|---:|
| Обычный | 0,61% / 0,44% | 1 151–126 396 ₽ | 1 011 / 829 ₽ | 1 021 / 1 024 ₽ |
| Отборный | 0,90% / 0,97% | 1 876–132 868 ₽ | −4 784 / −4 669 ₽ | 498 / 527 ₽ |
| Антикварный | 1,96% / 2,10% | 5 779–243 138 ₽ | −2 372 / −2 495 ₽ | 7 603 / 6 932 ₽ |

Соперники используют видимый фасад, количество закрытых мест и отдельный seed. Смена находки в коробке при том же фасаде не меняет старт и ставки соперников. Редкие предметы могут заметно поднимать итог лота. Цены продажи по объявлениям и ремонт в эксперимент не включены. Синтетические партии оценивают торги и перевозку, темп игры проверен сквозным маршрутом.

## Передача на Stage 7

Основные точки входа находятся в `src/game/stage5-engine.ts`, версия лота выбирает генератор в `src/game/stage6-auctions.ts`. Календарь можно подключить к завершению выезда после торгов или явной команды ожидания дома. Статус платёжного события должен сохраняться до анимации поездки. Барахолке понадобятся отдельное место хранения и своя команда передачи вещи. У неё будет тот же уникальный экземпляр, чтобы вещь одновременно не числилась в объявлении и в коробке. Если барахолка продаёт находку из лота, учитывать выручку через тот же расчёт итогов сделки. Фотоотчёт показать после сохранения принятого действия, а повтор показа оставить чисто визуальным.

## Иллюстрации

Ресурсы подготовлены встроенным imagegen. Запросы для воспроизводимости:

- `src/ui/assets/stage6-courier.jpg` — Original 3:2 landscape cinematic narrative game art. Early morning in a small Russian town, modest wooden house with blue trim, rusty garage behind it. An adult airport courier in a plain muted gray jacket walks from a parked white unmarked compact van toward the house holding an old ochre hard-shell suitcase. Quiet everyday atmosphere, realistic hand-painted textures, amber and muted teal, no text, logos, overlays, or borders.
- `src/ui/assets/stage6-suitcase-closed.png` — Isolated game sprite, strictly 90-degree overhead flat lay of a closed ochre hard-shell travel suitcase with a few scrapes, ribbed shell, short black side handle and zipper edge. Entire object visible with 7% margin. Realistic lightly painterly aesthetic. No branding, lettering, scenery or flooring. Transparent background, wide landscape composition.
- `src/ui/assets/stage6-suitcase-open.png` — Isolated game sprite, strictly 90-degree overhead flat lay, entire small two-sided open ochre hard-shell travel suitcase, hinged left-right and both halves fully flat. Include a few folded neutral beige and olive clothes tucked into one side only, leave the right compartment visibly clear to receive game item controls. Realistic lightly painterly aesthetic, medium warm shadows contained within silhouette, no branding or lettering, only suitcase and fabric, transparent background, no flooring or scenery, wide landscape composition with 7% margin.
- `src/ui/assets/stage6-floor-boards.jpg` — Full-bleed realistic flooring texture, orthographic straight down, completely flat worn medium-brown pine floorboards, subtle scratches and knots, matte wood, diffused neutral overhead light, moderate-low contrast, zero props, no walls, shadows from objects, composition overlays, borders or text. 3:2 landscape texture for a small-town house in a narrative game.
- `src/ui/assets/stage6-floor-stone.jpg` — Full-bleed realistic flooring texture, perfectly orthographic looking straight down, plain modest matte gray-beige stone floor tiles with subtle mottling and narrow inconspicuous grout lines under diffused neutral overhead light. No objects, room edges, text, decorations or exterior scenery. 3:2 landscape texture for a game background.
- `src/ui/assets/stage6-floor-parquet.jpg` — Full-bleed realistic flooring texture, perfectly orthographic straight down photograph, clean medium warm honey-oak herringbone parquet, subtle natural grain, soft diffused neutral overhead lighting, straight layout. Only the parquet, no objects, walls, text, furniture or decor. 3:2 landscape texture for a game background.
- `src/ui/assets/stage6-travel-kit.png` — Transparent isolated single item sprite, overhead flat lay photo-real hand-painted game asset: worn small dark olive zippered travel toiletry pouch resting flat with two small neutral bottles beside it. Soft natural light. Whole silhouette only, alpha outside, no logos, text, background, shadows outside item. Square.
- `src/ui/assets/stage6-travel-speaker.png` — Transparent isolated single item sprite, overhead flat lay, compact dark graphite portable wireless speaker with worn fabric grille and two discreet buttons, realistic hand-painted game item, soft natural light. Whole silhouette only, alpha outside, no logos, text, surface or scenery. Square.
- `src/ui/assets/stage6-travel-camera.png` — Transparent isolated single item sprite, strictly overhead flat lay of a vintage compact 35mm film camera resting flat showing black grip, brushed silver metal and glass lens, realistic hand-painted game item under soft natural light. Whole silhouette only, alpha outside, no logos, text, surface or scenery. Square.
