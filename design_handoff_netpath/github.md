repo: NickelFace/ccna-trainer
branch: main

## Last sync
date: 2026-08-23T04:55:11Z

### Updated in this project
- Экраны тренажёра перерисованы по реальному коду `app.js` (строки из `I18N.ru`, числа из `meta.json`)
- Убраны выдуманные функции: шаблоны попыток, история попыток, прогноз, «отложить в слабые»
- Добавлены пропущенные экраны: главная, настройка тренировки, разбор с фильтрами, экспорт ошибок в ИИ
- Счётчики типов вопросов уточнены по скриншоту владельца (798 / 403 / 159 / 35, номера до 1397)

## Screen map
| Экран (Trainer Screens.dc.html) | Источник в репозитории |
|---|---|
| 5a Главная | `ccna-exam-simulator/assets/js/app.js` — `home()`; `data/meta.json` |
| 5b Свой экзамен | `app.js` — `cfg('exam')`, `startCustomExam()` |
| 5h Тренировка · настройка | `app.js` — `cfg('practice')`, `startPractice()` |
| 5c Вопрос экзамена | `app.js` — `renderExam()`, `qBadges()`, `cliBlock()` |
| 5d Drag & Drop | `app.js` — `ddMarkup()`, `wireDD()`, `ddNeeded()` |
| 5e Тренировка · разбор | `app.js` — `renderPractice()`, `rationale()` |
| 5f Результат | `app.js` — `finishExam()`, `renderResults()` |
| 5g Разбор | `app.js` — `renderPracticeResults()`, `copyMistakes()` |
| Иконка приложения (Logo Directions.dc.html, 2c) | `ccna-mobile/android` — заменяет `res/drawable/ic_launcher_foreground.xml` |
| Site Landing.dc.html | `ccna-exam-simulator/README.ru.md`, `data/meta.json` |

## Примечания
- Веб-симулятор — статические файлы без бэкенда, SPA на одном адресе. Роутинга нет и не вводится: режимы открываются query-параметром `?mode=`.
- `ccna-mobile` — отдельный продукт, не обёртка над веб-версией: своя навигация, теория на 47 глав, SRS, прогноз готовности. Его экраны в этом проекте не проектировались.
- Пояснения по вариантам (`q.why`) существуют только на русском; в EN-режиме приложение их скрывает.
