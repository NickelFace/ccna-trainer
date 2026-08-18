---
id: sec-04-l2-security
dom: SEC
title: Безопасность второго уровня
lead: Port security, DHCP snooping и Dynamic ARP Inspection: три механизма против трёх классических атак внутри сегмента.
blueprint: ["5.7"]
minutes: 40
match:
  key: ["port security", "switchport port-security", "dhcp snooping", "dynamic arp inspection", "\\bDAI\\b", "err-?disable", "sticky", "mac flooding", "rogue dhcp", "arp spoof"]
  re: ["violation (mode|shutdown|restrict|protect)", "trusted port", "untrusted port", "binding table", "layer 2 attack", "maximum.*mac address"]
---

## Три атаки и три ответа

| Атака | Что делает злоумышленник | Механизм защиты |
|---|---|---|
| **MAC flooding** | заливает коммутатор фальшивыми MAC, таблица переполняется, коммутатор начинает флудить весь трафик | **port security** |
| **Rogue DHCP** | ставит свой DHCP-сервер и выдаёт себя как шлюз | **DHCP snooping** |
| **ARP spoofing** | отвечает на ARP чужим адресом и встаёт в середину обмена | **Dynamic ARP Inspection** |

Все три работают внутри одного сегмента, где ни ACL, ни firewall не помогут — трафик до
них просто не доходит.

## Port security

Ограничивает, **сколько** и **какие** MAC-адреса допустимы на порту.

```cfg
interface GigabitEthernet1/0/5
 switchport mode access
 switchport port-security
 switchport port-security maximum 2
 switchport port-security mac-address sticky
 switchport port-security violation restrict
 switchport port-security aging time 60
```

- `maximum` — сколько адресов разрешено (для порта с телефоном и ПК за ним нужно 2–3).
- `mac-address sticky` — коммутатор сам выучит адрес и запишет его в конфигурацию как
  статический; после `write memory` он переживёт перезагрузку.
- Порт **обязан быть access или trunk явно**: на динамическом (DTP) порту port security не
  включается.

Режимы нарушения — таблица, которую спрашивают почти всегда:

| Режим | Трафик нарушителя | Порт | Syslog/SNMP | Счётчик |
|---|---|---|---|---|
| **protect** | отбрасывается | остаётся up | нет | нет |
| **restrict** | отбрасывается | остаётся up | **да** | **да** |
| **shutdown** (по умолчанию) | — | **err-disabled** | да | да |

```cli
SW1# show port-security interface gigabitethernet1/0/5
Port Security              : Enabled
Port Status                : Secure-shutdown
Violation Mode             : Shutdown
Maximum MAC Addresses      : 2
Total MAC Addresses        : 2
Last Source Address:Vlan   : 0050.7966.6810:10
Security Violation Count   : 1
```

Порт после нарушения поднимают вручную (`shutdown` / `no shutdown`) или автоматически
через `errdisable recovery cause psecure-violation`.

## DHCP snooping

Коммутатор начинает разбирать DHCP-сообщения и делит порты на доверенные и нет.

```cfg
ip dhcp snooping
ip dhcp snooping vlan 10,20
no ip dhcp snooping information option        ! часто нужно, если нет relay-агента
!
interface GigabitEthernet1/0/24
 description uplink to distribution
 ip dhcp snooping trust
!
interface range gigabitethernet1/0/1 - 20
 ip dhcp snooping limit rate 10
```

Правила:

- **Доверенные** порты — те, за которыми стоит легитимный сервер или путь к нему (аплинки).
- На **недоверенных** портах отбрасываются серверные сообщения — **Offer, Ack, NAK**:
  клиент за таким портом может только просить, но не выдавать.
- Побочный результат — **binding table**: соответствия MAC ↔ IP ↔ порт ↔ VLAN,
  построенные из реальных выдач.

```cli
SW1# show ip dhcp snooping binding
MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface
00:50:79:66:68:00   192.168.10.21    85321       dhcp-snooping   10   Gi1/0/5
```

## Dynamic ARP Inspection

DAI проверяет каждый ARP-пакет на недоверенном порту по **той самой binding table**. Если
устройство утверждает, что 192.168.10.1 принадлежит его MAC, а в таблице записано иное —
пакет отбрасывается.

```cfg
ip arp inspection vlan 10,20
!
interface GigabitEthernet1/0/24
 ip arp inspection trust
!
! для устройств со статическим адресом, которых нет в binding table
arp access-list STATIC-HOSTS
 permit ip host 192.168.10.50 mac host 0050.7966.6899
ip arp inspection filter STATIC-HOSTS vlan 10
```

> [!key] Запомнить
> **DAI бесполезен без DHCP snooping** — ему неоткуда взять таблицу соответствий. В
> вопросах «что нужно включить перед DAI» ответ всегда DHCP snooping (либо статические
> ARP ACL для узлов со статикой).

## Что ещё относится к защите L2

- **BPDU guard** и **root guard** — из главы про STP: защита дерева от чужого коммутатора.
- **Отключение неиспользуемых портов** и перевод их в неиспользуемую VLAN.
- **Выделенная native VLAN** — против VLAN hopping двойным тегированием.
- **`switchport nonegotiate`** — против switch spoofing через DTP.
- **802.1X** — аутентификация устройства до выдачи доступа к сети (см. главу про AAA).

## Что спрашивают

- «Which violation mode drops traffic and sends a log message but keeps the port up?» —
  restrict.
- «What is the default violation mode?» — shutdown.
- «Which feature builds the binding table used by DAI?» — DHCP snooping.
- «Which DHCP messages are dropped on untrusted ports?» — серверные: Offer, Ack, NAK.
- «What does sticky learning do?» — выученный MAC записывается в конфигурацию как
  статический.
- «Which attack does port security mitigate?» — MAC flooding (и подключение чужого
  устройства).

## Проверь себя

```check
?? Порт ушёл в err-disabled после подключения второго устройства. Какой режим нарушения настроен?
!! shutdown — он же режим по умолчанию.
?? Какие DHCP-сообщения коммутатор отбросит на недоверенном порту?
!! Серверные: Offer, Ack и NAK.
?? Что нужно включить, чтобы заработал Dynamic ARP Inspection?
!! DHCP snooping — он строит binding table, по которой DAI проверяет ARP.
?? Порт с IP-телефоном и ПК за ним. Какое значение maximum разумно?
!! Два-три: телефон в голосовой VLAN и компьютер в данных.
?? Чем protect отличается от restrict?
!! Оба отбрасывают трафик нарушителя, но restrict ещё пишет в журнал и считает нарушения.
```
