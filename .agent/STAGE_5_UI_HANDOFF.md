# Stage 5 · Приёмка гаража и первой перепродажи

Общая ветка `stage-5/integration`. Контракт и девять ручных снимков из `9a6882e`, правила и сохранения из `22d2ad9`, проверенная точка входа и UI из `dff79e1`. Главная страница импортирует `mountStage5` из `./ui/mount`. Команды несут ревизию и нужные ID.

Проверено в Chrome 157.0.8103.79 на Windows. Размер 360×640 проверен с эмуляцией касания, 1280×900 — мышью и клавиатурой. Все девять снимков прочитаны через контракт. Проверены длинное имя, суммы 300 ₽, 2 000 ₽ и 100 000 ₽, нехватка 1 ₽, закрытая коробка, полный гараж и машина, последнее место, новый и прочитанный отклик, результат продажи. Проверены 44×44 px для интерактивных элементов и отсутствие горизонтальной прокрутки. Временная страница удалена после проверки главной.

## Сквозная сделка

С полного пролога герой получил ключи и увидел три вещи в гараже, банк 0 ₽, занято 3 из 8 мест. Пропуск в отдельном профиле также открыл гараж. На доске по очереди приняты предложения 2 000 ₽ за чайник, 750 ₽ за лампу и 600 ₽ за набор ключей. Первая продажа заняла 1,27 с на узком экране и 1,26 с на широком в автоматизированном сценарии, без времени на чтение и размышление.

При банке 3 350 ₽ игрок сделал ставки 2 000 ₽ и 3 000 ₽. Соперник остановился на 2 500 ₽. После покупки осталось 350 ₽. Коробка раскрыла инструмент по отдельной команде. Велосипед занял все 4 места машины, поэтому инструмент остался в лоте после явного подтверждения. Замена выбранного груза вернула место сразу, перезагрузка сохранила выбор. Дома велосипед занял 4 из 8 мест на полу.

Объявление на 100 000 ₽ осталось без отклика. Игрок снизил цену до 3 500 ₽, дождался предложения и обновил страницу. Продажа дала банк 3 850 ₽, прибыль по лоту 500 ₽ и 2 очка рейтинга. После продажи гараж пуст. Повторный клик по старой кнопке и перезагрузка не начислили деньги второй раз. Весь автоматизированный маршрут занял 1,92 с и 1,83 с соответственно.

На отдельном профиле с 0 ₽ ошибочный выбор места сортировки оставлял оплату недоступной. Три верных действия открыли выплату 2 000 ₽, перезагрузка сохранила выполненный заказ. Далее проверены ставка при точном банке, недоступное повышение и пас. Тест правил отдельно проверяет нехватку 1 ₽ и отдельный предел вместимости дома.

Сохранение v3 с открытыми торгами восстановило банк 10 000 ₽ и ставку 3 000 ₽. Сохранение с открытой сценой отношений продолжилось с 7 200 ₽ и после покупки цветов за 850 ₽ показало 6 350 ₽ и условие следующей встречи. Тесты покрывают v1–v3, ошибку записи, повтор, резерв и перенос ранее полученных денег за частично проданный лот. При первом принятом действии обе браузерные миграции записали v4.

## Проверка сборки

На чистой копии `npm ci`, `npm test` (83 теста), `npm run build`. Браузерные проверки проходили на главной странице `npm run preview -- --host 127.0.0.1 --port 4175 --strictPort`. Игровых блокеров в проверенных сценариях не обнаружено. Проверка физического телефона остаётся в общей предрелизной приёмке.

## Ресурсы

Оригинальные JPEG подготовлены встроенным imagegen, по 1536×1024. Запросы сохранены для воспроизводимости.

- `src/ui/assets/stage5-yard.jpg` — Original cinematic story-game illustration, 3:2 landscape, rain just ended in a small Russian town, old modest timber house with blue painted trim and adjacent weathered sheet-metal garage, birch trees, wet yard and puddles. At street edge a plain premium car is already driving away, puddle spray behind it. Painterly photorealism, dusk cool teal shadows and warm light, readable details. No people, text, signage or logos.
- `src/ui/assets/stage5-bar.jpg` — Original cinematic story-game illustration, 3:2 landscape. Modest quiet Russian small-town bar at dusk, rain on the window, a tired young adult man seated at a wooden bar, a pint of beer and an illuminated smartphone receiving a call, screen unreadable. Muted warm amber light and teal shadows, painterly photorealism, natural gesture. No lettering, logos or branding.
- `src/ui/assets/stage5-garage.jpg` — A pure cinematic landscape photograph of an old Russian small-town garage seen from inside its threshold. Open blue metal doors reveal the yard at sunrise, bare concrete floor, bare practical steel shelves at left and right, worn blue painted interior, workbench and warm bare bulb. Realistic environment concept art, 3:2 photograph, edge-to-edge architecture. No game UI, overlays, frames, icons, labels, ornaments, objects on shelves, text or logos.
