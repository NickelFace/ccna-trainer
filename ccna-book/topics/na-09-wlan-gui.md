---
id: na-09-wlan-gui
dom: NA
title: Настройка WLAN в GUI контроллера
lead: Порядок кликов при создании SSID: General, Security, QoS, Advanced — и что именно спрашивают про каждую вкладку.
blueprint: ["2.9"]
minutes: 30
match:
  key: ["wlan id", "profile name", "QoS profile", "platinum|gold|silver|bronze", "interface/interface group", "layer 2 security"]
  re: ["\\bWLAN\\b.*(create|configure|GUI)", "wlan id", "profile name", "\\bSSID\\b.*(WLC|controller|GUI)", "interface/interface group", "AAA servers tab", "QoS profile", "platinum|gold|silver|bronze", "layer 2 security", "\\bPSK\\b format", "broadcast ssid", "session timeout", "client exclusion", "band select", "wlan.*enable.*status"]
---

## Что и в каком порядке заполняют

Создание беспроводной сети на контроллере — это одна форма из четырёх вкладок. Экзамен
проверяет, **что где лежит**, а не умение кликать.

| Вкладка | Что задают |
|---|---|
| **General** | Profile Name, SSID, WLAN ID, Status (вкл/выкл), Radio Policy, **Interface/Interface Group** |
| **Security** | Layer 2 (WPA2/WPA3, PSK или 802.1X), Layer 3 (web auth), AAA Servers |
| **QoS** | профиль Platinum/Gold/Silver/Bronze, WMM, ограничения полосы |
| **Advanced** | таймауты сессии, client exclusion, FlexConnect, Band Select, DHCP |

Разница между **Profile Name** и **SSID**: первое — имя объекта внутри контроллера
(видно только администратору), второе — то имя, которое видят клиенты. Их различие
спрашивают напрямую.

## General

- **Interface/Interface Group** — здесь WLAN привязывают к dynamic interface, то есть к
  VLAN проводной сети. Без правильной привязки клиент ассоциируется, но остаётся без
  адреса.
- **Radio Policy** — на каких диапазонах вещать: All, 2.4 GHz only, 5 GHz only. Гостевой
  сети со старыми устройствами оставляют 2,4 ГГц; для скорости — только 5 ГГц.
- **Status** — WLAN создан, но не работает, пока не включён. Классическая причина «SSID не
  виден».
- **Broadcast SSID** (в General или Advanced в зависимости от версии) — анонсировать имя в
  beacon. Выключение не является мерой безопасности.

## Security

Layer 2 — основной выбор:

| Вариант | Когда |
|---|---|
| **WPA2 + PSK** | небольшая сеть, гостевая, IoT |
| **WPA2 + 802.1X** | корпоративная сеть с RADIUS и учётными записями |
| **WPA3 + SAE** | современная сеть, устойчивая к перебору пароля |
| **None** | только вместе с web auth (гостевой портал) |

Для PSK задают формат ключа (ASCII или HEX) и сам ключ. Для 802.1X во вкладке **AAA
Servers** выбирают RADIUS-серверы аутентификации и учёта — без этого корпоративный WLAN
не поднимется.

Layer 3 обычно — **Web Policy / Web Authentication**: гость получает адрес, но до входа в
портал ходит только к DNS и странице авторизации.

## QoS

Четыре профиля, и порядок надо знать:

| Профиль | Для чего | Приоритет |
|---|---|---|
| **Platinum** | голос | наивысший |
| **Gold** | видео | высокий |
| **Silver** | обычные данные (по умолчанию) | средний |
| **Bronze** | фоновый трафик, гости | низший |

Ставить гостевой сети Platinum — типичный неверный вариант; гостям дают **Bronze**, голосу
— **Platinum**.

Здесь же включают **WMM** (обязательно для голоса и видео) и лимиты полосы на клиента и на
SSID.

## Advanced

Что оттуда встречается в вопросах:

- **Session Timeout** — принудительная переаутентификация через N секунд.
- **Client Exclusion** — временная блокировка клиента после нескольких неудачных попыток
  входа (защита от перебора).
- **Band Select** — подталкивает двухдиапазонных клиентов к 5 ГГц.
- **FlexConnect Local Switching** — трафик этого WLAN коммутируется на точке, а не на
  контроллере.
- **DHCP Addr. Assignment Required** — клиент обязан получить адрес по DHCP, статический
  не примут.

## Порядок ввода в эксплуатацию

1. Создать **dynamic interface** в нужной VLAN (адрес, маска, шлюз, DHCP-сервер).
2. Создать WLAN: Profile Name, SSID, WLAN ID.
3. Привязать WLAN к этому интерфейсу.
4. Настроить Security: WPA2/WPA3, PSK или 802.1X + AAA.
5. Выбрать QoS-профиль.
6. Включить WLAN (**Status: Enabled**) и применить.
7. Проверить: клиент видит SSID, ассоциируется, получает адрес, ходит наружу.

> [!key] Запомнить
> Три вещи ломают новый WLAN чаще всего: **не включён Status**, **не привязан интерфейс**
> (клиент без адреса), **не настроен AAA** при 802.1X.

## Что спрашивают

- «Which tab is used to map the WLAN to a VLAN?» — General, поле Interface/Interface
  Group.
- «What is the difference between profile name and SSID?» — внутреннее имя против имени в
  эфире.
- «Which QoS profile should be assigned to voice / to guest traffic?» — Platinum /
  Bronze.
- «Where are the RADIUS servers selected?» — Security → AAA Servers.
- «A client associates but has no IP address» — неверный интерфейс/VLAN или DHCP.
- «Which setting forces re-authentication after a period?» — Session Timeout в Advanced.

## Проверь себя

```check
?? Клиент видит SSID и ассоциируется, но адрес не получает. Какие два места проверить на контроллере?
!! Привязку WLAN к dynamic interface (та ли VLAN) и настройки DHCP на этом интерфейсе.
?? Какой QoS-профиль ставят гостевой сети?
!! Bronze — самый низкий приоритет.
?? Где выбирают RADIUS-серверы для WPA2-Enterprise?
!! Вкладка Security → AAA Servers.
?? Чем Profile Name отличается от SSID?
!! Profile Name — имя записи в контроллере, SSID — имя сети, которое видят клиенты.
?? WLAN создан целиком и правильно, но в эфире его нет. Что забыли?
!! Включить его: Status должен быть Enabled.
```
