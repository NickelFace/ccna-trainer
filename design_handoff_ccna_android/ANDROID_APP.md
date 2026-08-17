# Android как отдельное приложение внутри того же репозитория

Да — держать всё в одном репозитории правильно, и вот почему именно здесь: банк вопросов
(`data/questions.json`), exhibit-картинки (`images/exhibits/`) и весь пайплайн исправлений
(`build/*.py`, `classify_overrides.json`, `why_data.json`, `option_fix.json`) — это источник истины.
Если приложение живёт в отдельном репо, каждая найденная опечатка в вопросе или неверный ключ
превращаются в ручную синхронизацию двух мест. Внутри монорепо баг правится один раз, в `build/`,
и попадает и в веб, и в APK одной командой.

## Структура

```
ccna-trainer/
├─ ccna-exam-simulator/            # веб-версия, остаётся как есть — не ломаем работающее
│  ├─ index.html
│  ├─ assets/{css,js,fonts}/
│  ├─ data/{questions.json,meta.json}      ← ИСТОЧНИК ИСТИНЫ банка
│  ├─ images/exhibits/qN.jpg               ← ИСТОЧНИК ИСТИНЫ картинок
│  └─ build/                                ← пайплайн банка, тоже не трогаем
│
├─ ccna-mobile/                    # НОВОЕ: Android-приложение как отдельный продукт
│  ├─ package.json                 # свои скрипты, свой capacitor
│  ├─ capacitor.config.json        # appId com.nickelface.ccnatrainer, webDir: dist
│  ├─ src/
│  │  ├─ index.html                # оболочка приложения (таб-бар, safe-area)
│  │  ├─ styles/tokens.css         # палитра и шкалы из README
│  │  ├─ app/
│  │  │  ├─ router.js              # стек экранов + перехват системного back
│  │  │  ├─ store.js               # persist: profile / session / attempts / srs / bookmarks
│  │  │  └─ screens/               # home, question, review, match, exam-setup, results, progress, ai-prompt, onboarding
│  │  ├─ engine/                   # ПЕРЕИСПОЛЬЗУЕМАЯ логика, вынесенная из assets/js/app.js
│  │  │  ├─ select.js              # weightedPick — largest remainder по весам 20/20/25/10/15/10
│  │  │  ├─ score.js               # scaled = 300 + pct*700, порог 825, perDomain
│  │  │  ├─ grade.js               # isCorrect, ddCorrect, ddExpected, ddNeeded
│  │  │  ├─ srs.js                 # Leitner-боксы и очередь дня
│  │  │  ├─ cli.js                 # разбор q.cli в блоки, свёртка длинных
│  │  │  └─ ai-prompt.js           # сборка промпта из шаблона + чипов
│  │  └─ assets/{fonts,icons}/     # локальные woff2 и Material Symbols — офлайн, без CDN
│  ├─ scripts/
│  │  ├─ sync-data.mjs             # копирует ../ccna-exam-simulator/{data,images/exhibits} → dist/
│  │  └─ build.mjs                 # сборка src/ → dist/ (esbuild, один bundle, без фреймворка)
│  ├─ android/                     # свой Capacitor-проект (не тот, что у веб-обёртки)
│  └─ tests/                        # unit на engine/: скоринг, выборка, SRS-интервалы, dd-проверка
│
├─ shared/                          # опционально, если движок понадобится и вебу
│  └─ engine/                       # тогда ccna-mobile/src/engine — симлинк/импорт отсюда
│
├─ .github/workflows/
│  ├─ android-release.yml           # сборка подписанного AAB/APK по тегу v*
│  └─ data-check.yml                # валидация банка: ключи, дубли, битые img (уже полезно и вебу)
│
├─ run.sh / stop.sh                 # как есть
└─ github.md
```

Ключевое правило: **`ccna-mobile` не хранит копию банка в git**. `dist/data` и `dist/images`
в `.gitignore`, наполняются `npm run sync-data` перед сборкой. Один источник — `ccna-exam-simulator/data`.

## Команды

```jsonc
// ccna-mobile/package.json
"scripts": {
  "sync-data": "node scripts/sync-data.mjs",           // тянет банк и картинки из ../ccna-exam-simulator
  "build":     "npm run sync-data && node scripts/build.mjs",
  "dev":       "node scripts/build.mjs --watch --serve 8100",
  "android":   "npm run build && npx cap sync android",
  "android:open":    "npm run android && npx cap open android",
  "android:release": "npm run android && cd android && ./gradlew bundleRelease",
  "test":      "node --test tests/"
}
```

Старую обёртку у веб-версии (`ccna-exam-simulator/android/`, `scripts/build-www.js`,
`android:sync`) после переезда лучше удалить — иначе в репозитории два Android-проекта с одним
`applicationId` и непонятно, из какого собран установленный APK. До переезда, пока новое приложение
не догнало старое по функциям, оставить, но `applicationId` у нового сделать
`com.nickelface.ccnatrainer` (тот же, как замена) и не собирать оба.

## Платформенные правки Android (сейчас всё по умолчанию Capacitor)

| Что | Сейчас | Надо |
|---|---|---|
| Системная «назад» | `BridgeActivity` без обработки — закрывает приложение | перехват: шаг назад по стеку, во время экзамена диалог подтверждения |
| Safe-area / edge-to-edge | нет; `.lang-switch` прижат `top:12px` и лезет под статус-бар | `env(safe-area-inset-*)` во всех липких панелях; с `targetSdk 35` Android рисует под системными панелями принудительно |
| Сохранение сессии | нет — состояние в глобальной `S` | автосейв каждого действия в Preferences/SQLite, восстановление при возврате |
| Экран во время экзамена | гаснет | `KeepAwake` только на время экзамена, выключать при выходе |
| Splash | 12 растровых png на каждую плотность | Splash Screen API (`androidx.core:core-splashscreen` уже в зависимостях), один vector + `windowSplashScreenBackground #0e1013` |
| `android.permission.INTERNET` | запрошено | офлайн-приложению не нужно — убрать (открытие ИИ идёт через внешний intent, разрешения не требует) |
| `allowBackup` | `true` | `false` (или явный `backup_rules.xml`): прогресс и SRS не должны молча переезжать между устройствами |
| `versionCode` | `1` | из CI: `versionCode` = номер сборки, `versionName` из тега |
| `minifyEnabled` | `false` | `true` + `shrinkResources` для release, свои proguard-правила |
| Подпись | нет keystore в проекте | keystore в GitHub Secrets, подпись в workflow, `.gitignore` на `*.jks` |
| Ориентация | `configChanges` перехватывает всё | оставить, но проверить верстку в landscape (или заблокировать portrait на телефонах) |
| Локаль | RU/EN только в JS | вынести язык в профиль + `android:localeConfig` |

## Что можно вынести в общий код с вебом

Стоит: `engine/` — выборка по весам, скоринг, проверка ответов, парсер CLI, шаблон ИИ-промпта, SRS.
Это чистые функции без DOM, их же удобно покрыть тестами и переиспользовать в вебе, заменив куски
`app.js`.

Не стоит: разметку и стили. Мобильный интерфейс сознательно другой (таб-бар, липкие панели,
сопоставление тапом, шторка разбора), веб остаётся широким с клавиатурой — общий UI-слой здесь
только связал бы руки.

## Порядок работ

1. `ccna-mobile/` + `sync-data.mjs` + `build.mjs`, пустая оболочка с таб-баром и safe-area — собирается APK.
2. `engine/` вынести из `app.js` как модули + тесты (скоринг, weightedPick, ddCorrect).
3. `store.js` с персистом и восстановлением сессии; экран вопроса + разбор (шторка) + экзамен с таймером.
4. Экран сопоставления тапом — заменяет drag & drop.
5. Результат + история попыток + прогресс.
6. SRS-очередь и главная с планом на день.
7. Генератор ИИ-промпта, онбординг, настройки экзамена.
8. Платформенные правки из таблицы, release-workflow, подпись, публикация.
9. Удалить `ccna-exam-simulator/android/` и `scripts/build-www.js`, обновить README репозитория.
