# Промпт для Claude Code — замена ASCII-схем на SVG в стиле «dark terminal»

## Роль и цель

Ты конвертируешь сетевые диаграммы из ASCII (псевдографика в код-блоках) в SVG-диаграммы по единому стилю, описанному ниже. Стиль уже утверждён; **не импровизируй с палитрой, размерами и формой иконок** — используй готовые `<symbol>` и токены как есть.

Задача:
1. Найти в репозитории ASCII-схемы сетей (в `.md`, `README`, заметках).
2. Для каждой распарсить: устройства, линки (со скоростью/интерфейсами, если указаны), группировки (зоны OSPF, VLAN, площадки).
3. Собрать SVG строго по этому стилю.
4. Заменить ASCII-блок ссылкой на сгенерированный SVG (или встроенным SVG). Историю не теряем — полагаемся на git.
5. Самопроверить по чек-листу в конце.

Если в ASCII не хватает данных (скорость линка, имя интерфейса) — **не выдумывай**: используй нейтральный стиль линка и оставь интерфейс без подписи. Сохраняй все явно указанные подписи.

---

## 1. Токены стиля (dark terminal)

- Фон: `#0a0e17`
- Сетка-подложка: линии `#1a2030`, шаг `32px`
- Шрифт: `'JetBrains Mono','Fira Code',ui-monospace,monospace`
- Основной текст подписей: `#e2e8f0` / приглушённый `#94a3b8` / hint `#475569`
- Акцент-заголовок (комментарий-строка вверху): `#00d4ff`, формат `// <название схемы>`
- Свечение иконок: `feDropShadow stdDeviation 3–4`, `flood-opacity 0.8–0.9`, цвет = цвет устройства
- `viewBox="0 0 W H"`, ширина холста подбирается под контент; обязательны `role="img"` + `<title>` + `<desc>`

---

## 2. Палитра устройств (цвет = тип устройства)

| Цвет | Тип | Заливка иконки | Внутренние линии |
|---|---|---|---|
| `#7c3aed` | Router | `#150f2e` | `#a78bfa` |
| `#10b981` | Switch L2 | `#0c1f1a` | `#34d399` |
| `#14b8a6` | Switch L3 | `#07201d` | `#2dd4bf` |
| `#00d4ff` | PC / host | `#08161d` | `#00d4ff` |
| `#3b82f6` | Server | `#0b1530` | `#60a5fa` |
| `#ef4444` | Firewall | `#1f0c0c` | `#f87171` |
| `#f59e0b` | Access Point | `#1f1404` | `#fbbf24` |
| `#94a3b8` | Internet / WAN | `#11161f` | `#cbd5e1` |
| `#ec4899` | резерв (LB / NAT) | — | — |
| `#eab308` | резерв (IP-телефон / акцент) | — | — |

Правило: **разные типы — разные цвета**, Internet ≠ PC. Новые типы устройств берут резервные цвета и тот же шаблон иконки 120×120.

---

## 3. Иконки — готовые `<symbol>` (источник истины)

Вставляй этот блок `<defs>` в каждый SVG и инстанцируй через `<use href="#id" x.. y.. width="64" height="64"/>`. Размер на схеме — 64px (можно 56–72 при необходимости). Каждый symbol = `viewBox 0 0 120 120`.

```svg
<defs>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32" fill="none" stroke="#1a2030" stroke-width="1"/>
  </pattern>

  <filter id="gp" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#7c3aed" flood-opacity="0.85"/></filter>
  <filter id="gg" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#10b981" flood-opacity="0.85"/></filter>
  <filter id="gt" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#14b8a6" flood-opacity="0.85"/></filter>
  <filter id="gc" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00d4ff" flood-opacity="0.8"/></filter>
  <filter id="gb" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#3b82f6" flood-opacity="0.8"/></filter>
  <filter id="gr" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ef4444" flood-opacity="0.8"/></filter>
  <filter id="ga" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.8"/></filter>
  <filter id="gs" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#94a3b8" flood-opacity="0.75"/></filter>

  <marker id="mp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#a78bfa"/></marker>
  <marker id="mg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#34d399"/></marker>
  <marker id="mt" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#2dd4bf"/></marker>

  <symbol id="router" viewBox="0 0 120 120">
    <g filter="url(#gp)"><circle cx="60" cy="60" r="34" fill="#150f2e" stroke="#7c3aed" stroke-width="2.5"/></g>
    <g stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round">
      <line x1="60" y1="49" x2="60" y2="33" marker-end="url(#mp)"/>
      <line x1="60" y1="71" x2="60" y2="87" marker-end="url(#mp)"/>
      <line x1="71" y1="60" x2="87" y2="60" marker-end="url(#mp)"/>
      <line x1="49" y1="60" x2="33" y2="60" marker-end="url(#mp)"/>
    </g>
  </symbol>

  <symbol id="sw2" viewBox="0 0 120 120">
    <g filter="url(#gg)"><rect x="20" y="32" width="80" height="56" rx="6" fill="#0c1f1a" stroke="#10b981" stroke-width="2.5"/></g>
    <g stroke="#34d399" stroke-width="2.2" stroke-linecap="round">
      <line x1="34" y1="45" x2="86" y2="45" marker-end="url(#mg)"/>
      <line x1="86" y1="55" x2="34" y2="55" marker-end="url(#mg)"/>
      <line x1="34" y1="65" x2="86" y2="65" marker-end="url(#mg)"/>
      <line x1="86" y1="75" x2="34" y2="75" marker-end="url(#mg)"/>
    </g>
  </symbol>

  <symbol id="sw3" viewBox="0 0 120 120">
    <g filter="url(#gt)"><rect x="20" y="32" width="80" height="56" rx="6" fill="#07201d" stroke="#14b8a6" stroke-width="2.5"/></g>
    <g stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" fill="none">
      <line x1="34" y1="50" x2="80" y2="50" marker-end="url(#mt)"/>
      <line x1="80" y1="62" x2="34" y2="62" marker-end="url(#mt)"/>
      <line x1="34" y1="74" x2="80" y2="74" marker-end="url(#mt)"/>
    </g>
    <rect x="74" y="26" width="28" height="16" rx="8" fill="#14b8a6"/>
    <text x="88" y="38" fill="#04241f" font-size="11" font-weight="bold" text-anchor="middle">L3</text>
  </symbol>

  <symbol id="pc" viewBox="0 0 120 120">
    <g filter="url(#gc)"><rect x="26" y="32" width="68" height="46" rx="5" fill="#08161d" stroke="#00d4ff" stroke-width="2.5"/></g>
    <text x="38" y="62" fill="#00d4ff" font-size="20" font-weight="bold">&gt;_</text>
    <line x1="60" y1="78" x2="60" y2="88" stroke="#00d4ff" stroke-width="3" stroke-linecap="round"/>
    <rect x="44" y="88" width="32" height="5" rx="2.5" fill="#00d4ff"/>
  </symbol>

  <symbol id="server" viewBox="0 0 120 120">
    <g filter="url(#gb)"><rect x="40" y="24" width="40" height="72" rx="6" fill="#0b1530" stroke="#3b82f6" stroke-width="2.5"/></g>
    <g stroke="#60a5fa" stroke-width="2" stroke-linecap="round">
      <line x1="50" y1="38" x2="70" y2="38"/><line x1="50" y1="50" x2="70" y2="50"/><line x1="50" y1="62" x2="70" y2="62"/>
    </g>
    <circle cx="50" cy="82" r="2.6" fill="#60a5fa"/><circle cx="60" cy="82" r="2.6" fill="#60a5fa"/>
  </symbol>

  <symbol id="firewall" viewBox="0 0 120 120">
    <g filter="url(#gr)"><rect x="26" y="34" width="68" height="52" rx="5" fill="#1f0c0c" stroke="#ef4444" stroke-width="2.5"/></g>
    <g stroke="#f87171" stroke-width="1.8" stroke-linecap="round">
      <line x1="26" y1="51" x2="94" y2="51"/><line x1="26" y1="68" x2="94" y2="68"/>
      <line x1="49" y1="34" x2="49" y2="51"/><line x1="71" y1="34" x2="71" y2="51"/>
      <line x1="38" y1="51" x2="38" y2="68"/><line x1="60" y1="51" x2="60" y2="68"/><line x1="82" y1="51" x2="82" y2="68"/>
      <line x1="49" y1="68" x2="49" y2="86"/><line x1="71" y1="68" x2="71" y2="86"/>
    </g>
  </symbol>

  <symbol id="ap" viewBox="0 0 120 120">
    <g filter="url(#ga)"><rect x="30" y="66" width="60" height="22" rx="6" fill="#1f1404" stroke="#f59e0b" stroke-width="2.5"/></g>
    <line x1="40" y1="78" x2="50" y2="78" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="3" fill="#fbbf24"/>
    <g stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" fill="none">
      <path d="M48 56 Q60 44 72 56"/><path d="M40 54 Q60 33 80 54"/>
    </g>
  </symbol>

  <symbol id="internet" viewBox="0 0 120 120">
    <g filter="url(#gs)"><path d="M38 80 a16 16 0 0 1 -2 -31 a20 20 0 0 1 38 -6 a15 15 0 0 1 14 12 a13 13 0 0 1 -2 25 Z" fill="#11161f" stroke="#94a3b8" stroke-width="2.5" stroke-linejoin="round"/></g>
    <text x="60" y="69" fill="#cbd5e1" font-size="13" font-weight="bold" text-anchor="middle">WWW</text>
  </symbol>
</defs>
```

Соответствие типов и `id`: `router`, `sw2` (Switch L2), `sw3` (Switch L3), `pc`, `server`, `firewall`, `ap`, `internet`.

---

## 4. Линки — скорость кодируется яркостью и толщиной

Линки рисуй **до** иконок (иконки сверху). Никаких стрелок на линках. Линия останавливается у края иконки (не заходит внутрь).

| Скорость | Цвет | Толщина |
|---|---|---|
| GigabitEthernet 1G | `#cbd5e1` | `2.5` |
| FastEthernet 100M | `#64748b` | `2` |
| Ethernet 10M | `#475569` | `1.5` |
| (не указана) | `#64748b` | `2` |

```svg
<line x1=".." y1=".." x2=".." y2=".." stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" fill="none"/>
```

---

## 5. Подписи интерфейсов на линках (стиль EVE-NG)

Маленькая пилюля с именем интерфейса, сидит **на** линке и перекрывает линию под собой (непрозрачная заливка). Подписывай только инфраструктурные линки (router↔router, router↔switch, аплинки). Access-порты к PC/AP/серверу оставляй чистыми.

```svg
<g font-size="9" text-anchor="middle" fill="#94a3b8">
  <rect x="PX-20" y="PY-7" width="40" height="14" rx="4" fill="#131a28" stroke="#2a3548" stroke-width="0.6"/>
  <text x="PX" y="PY+3">Gi0/0</text>
</g>
```
Ширину `rect` подгоняй под длину имени (база 40px на `Gi0/0`).

---

## 6. Зоны / группы (OSPF area, VLAN, площадка)

Пунктирный прямоугольник + очень слабая slate-заливка + метка. Backbone (`Area 0`) — плотнее пунктир. Рисуй **первыми** (фон).

```svg
<rect x=".." y=".." width=".." height=".." rx="10"
      fill="#94a3b8" fill-opacity="0.10" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2 4"/>
```
- backbone: `fill-opacity="0.10"`, `stroke-dasharray="2 4"`
- обычная зона: `fill-opacity="0.05"`, `stroke-dasharray="6 4"`
- метка зоны: `#94a3b8`, `font-size="12"`

**Правило размещения метки зоны (важно — иначе линк/пилюля перекроют текст):** метка ставится туда, где её не пересекает входящий линк.
- если линк входит сбоку/слева — метка в левом-верхнем углу зоны;
- если линк входит по центру сверху — метку центрируй по верхней кромке (`text-anchor="middle"`), мимо линка;
- метка никогда не должна лежать на вертикальной линии входящего линка.

---

## 7. Подписи устройств (стиль EVE-NG)

Маркер-квадрат цвета устройства + имя, на непрозрачном чипе. Чип закрывает линию под собой (решает пересечение линка и текста). Рисуй **последними** (поверх всего). Чип — близко к глифу (зазор ~4–5px), не «отлетает».

```svg
<g font-size="11" fill="#cbd5e1">
  <rect x="CX-W/2" y="CY+23" width="W" height="16" rx="4" fill="#0d1320" stroke="#1f2937" stroke-width="0.6"/>
  <rect x="SX" y="CY+27" width="7" height="7" rx="1" fill="DEVICE_COLOR"/>
  <text x="SX+11" y="CY+34">R1</text>
</g>
```
- `CX,CY` — центр иконки; ширина чипа `W = 16 + 7 + 4 + ширина_текста`;
- `SX = CX - (7 + 4 + ширина_текста)/2` (контент центрируется в чипе);
- символ интерфейса L3 уже встроен в иконку `sw3` — отдельно не дублируй.

---

## 8. Порядок слоёв в SVG

1. фон `#0a0e17` + сетка
2. заголовок-комментарий `// …`
3. зоны (пунктир + заливка + метки зон)
4. линки (линии)
5. пилюли интерфейсов
6. иконки устройств (`<use>`)
7. подписи устройств (чип + маркер + имя)
8. легенда (если нужна)

Легенда (опционально, правый верхний угол): образцы трёх скоростей линков + образец зоны + строка `colour = device type`.

---

## 9. Парсинг ASCII → модель

Из ASCII извлекай:
- **узлы**: по ключевым словам/меткам (`R1`, `SW`, `FW`, `PC`, `SRV`, `AP`, `Internet`, `cloud`, `()` для роутеров, `[]` для свитчей и т.п.). Тип определяй по имени/контексту; при неоднозначности — спроси или выбери ближайший тип и отметь.
- **линки**: линии между узлами (`---`, `===`, `|`, `+`). Скорость/интерфейс — только если подписаны рядом (`Gi0/0`, `Fa0/1`, `1G`, `100M`).
- **группы**: рамки/отступы/подписи `Area X`, `VLAN Y`, названия площадок → зоны.

Раскладку делай читаемой: одно направление потока (сверху-вниз или слева-направо), расстояние между иконками ≥ ~110px, линки не пересекают чужие иконки и метки.

---

## 10. Что делать с результатом

- Сохраняй SVG рядом с документом (напр. `docs/diagrams/<имя>.svg`).
- В markdown заменяй ASCII-блок на `![<подпись>](diagrams/<имя>.svg)` (или встроенный `<svg>`, если документ это допускает).
- Один SVG на схему. Не объединяй несколько схем в один файл.

---

## 11. Чек-лист самопроверки (проверяй каждую схему)

- [ ] Все узлы из ASCII присутствуют, тип/цвет по таблице из §2.
- [ ] Internet и PC — разные цвета.
- [ ] Линки: скорость отражена яркостью+толщиной; неуказанные — нейтральный стиль.
- [ ] Ни одна подпись (зоны / устройства / интерфейса) не пересекается с линией линка — там, где пересечение возможно, текст лежит на непрозрачном чипе/пилюле или смещён.
- [ ] Метка зоны не лежит на входящем линке (§6).
- [ ] Чип подписи устройства близко к глифу (~4–5px), не «отлетает».
- [ ] Иконки не накладываются друг на друга; линки не режут чужие иконки.
- [ ] `viewBox` вмещает весь контент; есть `role="img"`, `<title>`, `<desc>`.
- [ ] Палитра, шрифт, фон — строго по токенам §1–2.
- [ ] Сохранены все явные подписи интерфейсов/скоростей из исходного ASCII.

---

## Эталон

Референсная топология со всеми тремя каналами (устройства / скорости линков / зоны) и корректным размещением подписей — `demo-topology.svg`. Используй её как образец раскладки и слоёв.
