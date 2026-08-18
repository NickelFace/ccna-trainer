---
id: ips-03-ntp
dom: IPS
title: NTP и точное время
lead: Зачем сети единое время, что такое stratum, клиент, сервер и симметричный режим, и как читать show ntp status.
blueprint: ["4.2"]
minutes: 20
match:
  key: ["\\bNTP\\b", "stratum", "ntp server", "ntp master", "clock synchron"]
  re: ["time synchron", "network time protocol", "timestamp.*log", "\\bUTC\\b.*clock", "show ntp"]
---

## Почему время — это инфраструктура

Без единого времени сеть становится неотлаживаемой: журналы с разных устройств не
складываются в общую картину, сертификаты «истекают» раньше срока, Kerberos отказывает,
а расследование инцидента превращается в гадание.

Поэтому NTP — не украшение, а базовая служба, и вопросы про него всегда про это: **зачем**
нужен, **какие роли** бывают, **как проверить**.

## Stratum

Stratum — расстояние до эталонного источника времени:

| Stratum | Кто это |
|---:|---|
| 0 | сам эталон: атомные часы, GPS-приёмник (в сети не участвует) |
| 1 | сервер, подключённый к эталону напрямую |
| 2 | тот, кто синхронизируется с stratum 1 |
| … | каждый следующий на единицу дальше |
| 16 | **не синхронизирован**, времени доверять нельзя |

Меньше stratum — авторитетнее источник. Значение 16 в выводе означает, что синхронизация
не состоялась.

Транспорт — **UDP 123**.

## Роли и настройка

```cfg
! Клиент: синхронизироваться с внешним сервером
ntp server 216.239.35.0
ntp server 10.0.0.10 prefer

! Собственный источник времени, когда наружу нельзя
ntp master 3

! Аутентификация — чтобы никто не подсунул фальшивое время
ntp authenticate
ntp authentication-key 1 md5 S3cretKey
ntp trusted-key 1
ntp server 10.0.0.10 key 1

! Часовой пояс и переход на летнее время
clock timezone AEST 10 0
clock summer-time AEDT recurring
```

Полезная практика, которую спрашивают: устройства держат внутреннее время в **UTC**, а
часовой пояс применяется только при отображении. Поэтому логи разных площадок сравнимы.

## Проверка

```cli
R1# show ntp status
Clock is synchronized, stratum 3, reference is 10.0.0.10
nominal freq is 250.0000 Hz, actual freq is 249.9999 Hz, precision is 2**18
reference time is E9A3B2C1.7C4D5E00 (09:14:25.486 UTC Wed Aug 19 2026)

R1# show ntp associations
  address         ref clock       st   when   poll reach  delay  offset   disp
*~10.0.0.10       216.239.35.0     2     34     64   377  1.234   0.045  0.512
 ~10.0.0.11       216.239.35.4     2     41     64   377  1.512  -0.031  0.688
* master (synced), ~ configured

R1# show clock detail
09:14:31.204 AEST Wed Aug 19 2026
Time source is NTP
```

Как читать:

- `Clock is synchronized` — главное слово; `unsynchronized` означает, что источник не
  найден или не принят.
- `*` в `show ntp associations` — с этим сервером синхронизированы сейчас.
- `reach 377` (восьмеричное, все восемь последних опросов удачны) — связь стабильна.
- `Time source is NTP` в `show clock` — время пришло от NTP, а не выставлено вручную
  (`Time source is user configuration`).

## Связка с журналами

Смысл всей темы виден в syslog: без NTP каждое устройство ставит своё время, и
последовательность событий восстановить нельзя.

```cfg
service timestamps log datetime msec localtime show-timezone
service timestamps debug datetime msec
```

Эти команды заставляют IOS ставить в каждой строке журнала полную дату и время — вместе с
NTP это и даёт сопоставимые логи.

## Что спрашивают

- «What is the function of NTP?» — синхронизация часов устройств сети.
- «What does stratum indicate?» — удалённость от эталонного источника времени.
- «Which stratum means unsynchronized?» — 16.
- «Which command makes a router an authoritative time source?» — `ntp master <stratum>`.
- «Why is time synchronization important?» — корректные метки в журналах, работа
  сертификатов и аутентификации.
- «Which port does NTP use?» — UDP 123.

## Проверь себя

```check
?? Что означает stratum 16 в выводе?
!! Устройство не синхронизировано, его времени доверять нельзя.
?? Какая команда делает роутер источником времени для остальных?
!! ntp master <stratum>.
?? В каком часовом поясе устройства хранят время внутри себя?
!! В UTC; часовой пояс применяется только при отображении.
?? Что показывает звёздочка в show ntp associations?
!! Сервер, с которым устройство синхронизировано в данный момент.
?? Зачем NTP при разборе инцидента?
!! Только единое время позволяет сложить журналы разных устройств в одну хронологию.
```
