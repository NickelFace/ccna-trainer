---
id: ips-04-snmp-syslog
dom: IPS
title: SNMP и Syslog
lead: Опрос и trap, версии SNMP и почему v3, уровни серьёзности syslog от 0 до 7 и как читать строку журнала.
blueprint: ["4.4", "4.5"]
minutes: 30
match:
  key: ["\\bSNMP\\b", "\\bsyslog\\b", "\\btrap\\b", "\\bMIB\\b", "severity level", "logging (host|trap|buffered)", "community string", "\\bOID\\b"]
  re: ["network management.*(monitor|protocol)", "\\bget\\b.*\\bset\\b.*agent", "informational message", "emergenc|alert|critical.*level", "log message.*level"]
---

## SNMP: опрос устройств

Три роли:

- **Manager (NMS)** — система мониторинга, которая опрашивает.
- **Agent** — процесс на устройстве, который отвечает.
- **MIB** — база объектов агента; каждый параметр адресуется числовым **OID**.

Операции:

| Операция | Кто инициирует | Смысл |
|---|---|---|
| `get` / `getnext` / `getbulk` | manager | прочитать значение |
| `set` | manager | **изменить** параметр на устройстве |
| `trap` | agent | сообщить о событии самому, без опроса |
| `inform` | agent | то же, но с подтверждением от manager |

Порты: агент слушает **UDP 161**, manager принимает trap на **UDP 162**.

> [!key] Запомнить
> `trap` инициирует устройство, а не система мониторинга — на этом строятся вопросы «как
> NMS узнает об отказе интерфейса, не дожидаясь опроса». Разница с `inform` — только в
> подтверждении доставки.

## Версии

| Версия | Аутентификация | Шифрование |
|---|---|---|
| v1 | community string открытым текстом | нет |
| v2c | то же, плюс getbulk и inform | нет |
| **v3** | пользователи, HMAC | **да** (AES/DES) |

Community string в v1/v2c — фактически пароль, летящий в открытом виде; `RO` даёт чтение,
`RW` — запись. Отсюда правильные ответы на вопросы о безопасности: **использовать v3**, а
если v2c неизбежен — ограничивать ACL и никогда не оставлять `public`/`private`.

```cfg
! v2c — минимально допустимо только с ACL
access-list 10 permit 10.0.0.50
snmp-server community R3adOnly RO 10
snmp-server host 10.0.0.50 version 2c R3adOnly
snmp-server enable traps

! v3 — правильный вариант
snmp-server group MON v3 priv
snmp-server user nms MON v3 auth sha AuthPass priv aes 128 PrivPass
```

## Syslog: журнал событий

Формат строки IOS:

```txt
*Aug 19 09:14:31.204 AEST: %LINEPROTO-5-UPDOWN: Line protocol on
    Interface GigabitEthernet0/1, changed state to down
             │        │ │
             │        │ └─ мнемоника события
             │        └─── уровень серьёзности (severity)
             └──────────── источник (facility)
```

Восемь уровней, от 0 до 7. Меньше число — серьёзнее:

| Уровень | Имя | Что попадает |
|---:|---|---|
| 0 | Emergency | система неработоспособна |
| 1 | Alert | требуется немедленное вмешательство |
| 2 | Critical | критическое состояние (перегрев, отказ блока) |
| 3 | Error | ошибка (интерфейс в err-disabled) |
| 4 | Warning | предупреждение |
| 5 | **Notification** | нормальное значимое событие — смена состояния интерфейса |
| 6 | Informational | информационное |
| 7 | Debugging | вывод debug |

Мнемоника для порядка: **E**very **A**wesome **C**isco **E**ngineer **W**ill **N**eed
**I**ce cream **D**aily.

Настройка уровня означает «этот и всё серьёзнее»: `logging trap 4` отправит уровни 0–4.

```cfg
logging host 10.0.0.60
logging trap informational          ! уровни 0–6 на сервер
logging buffered 16384 debugging    ! локальный буфер
logging console warnings            ! на консоль только 0–4
service timestamps log datetime msec localtime show-timezone
```

```cli
R1# show logging
Syslog logging: enabled
    Console logging: level warnings
    Buffer logging: level debugging, 214 messages logged
    Trap logging: level informational, host 10.0.0.60
```

Порт syslog — **UDP 514**.

## Куда идут сообщения

| Назначение | Команда | Особенность |
|---|---|---|
| Консоль | `logging console` | видно только у консольной сессии |
| Сессия vty | `terminal monitor` | **включается в каждой сессии заново** |
| Локальный буфер | `logging buffered` | теряется при перезагрузке |
| Внешний сервер | `logging host` | единственный вариант для хранения и анализа |

Классический вопрос: «подключился по SSH и не вижу сообщений, которые видны на консоли» →
нужна команда `terminal monitor`.

## Что спрашивают

- «Which SNMP operation is initiated by the agent?» — trap (или inform).
- «Which SNMP version provides encryption?» — v3.
- «What is the purpose of a community string?» — простая аутентификация в v1/v2c,
  открытым текстом.
- «Which syslog level corresponds to an interface changing state?» — 5, notification.
- «What does logging trap 4 send?» — уровни 0–4 включительно.
- «Which port does syslog / SNMP use?» — UDP 514 / UDP 161 (traps 162).
- «Why does an SSH session not show log messages?» — не выполнена `terminal monitor`.

## Проверь себя

```check
?? Чем trap отличается от get?
!! Trap отправляет агент сам при событии; get инициирует система мониторинга при опросе.
?? Какая версия SNMP шифрует данные и как она аутентифицирует?
!! Третья: пользователи с HMAC-аутентификацией и шифрованием AES/DES.
?? Что означает 5 в %LINEPROTO-5-UPDOWN?
!! Уровень серьёзности notification.
?? logging trap 3 — какие сообщения уйдут на сервер?
!! Уровни 0, 1, 2 и 3 — этот и все более серьёзные.
?? Подключился по SSH, сообщений журнала не видно. Что сделать?
!! Выполнить terminal monitor в этой сессии.
```
