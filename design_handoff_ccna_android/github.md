repo: NickelFace/ccna-trainer
branch: main
path: ccna-exam-simulator

## Last sync
date: 2026-08-17T09:43:44Z

### Updated in this project
- Воссозданы текущие экраны симулятора (home, practice, exam, drag&drop, results) из styles.css + app.js
- Разбор UI/UX: 9 находок по вебу и Android-обёртке Capacitor
- Предложен редизайн приложения как отдельного продукта: таб-бар, автосейв сессии, SRS, генератор ИИ-промпта, сопоставление тапом вместо drag&drop

## Screen map
| Экран проекта | Файлы репозитория |
|---|---|
| Current UI.dc.html · 01 Home | assets/js/app.js (home), data/meta.json, assets/css/styles.css |
| Current UI.dc.html · 02 Practice | assets/js/app.js (renderPractice, rationale), assets/css/styles.css |
| Current UI.dc.html · 03 Exam | assets/js/app.js (renderExam, qBadges, exhibit), assets/css/styles.css |
| Current UI.dc.html · 04 Drag & drop | assets/js/app.js (ddMarkup, wireDD), build/dd_parts/pilot.json |
| Current UI.dc.html · 05 Results | assets/js/app.js (finishExam, renderResults, reviewItemHTML) |
| Redesign.dc.html · анализ | index.html, assets/css/styles.css, assets/js/app.js, capacitor.config.json, android/app/build.gradle, android/app/src/main/AndroidManifest.xml, android/app/src/main/res/values/styles.xml, scripts/build-www.js |
| Redesign.dc.html · макеты 01–09 | те же источники (переработка), build/classify_input/pilot.json (реальные вопросы) |
