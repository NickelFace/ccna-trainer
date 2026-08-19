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

## Разбор атаки: rogue DHCP + ARP spoofing как связка на перехват трафика

Классический сценарий MITM внутри сегмента строится из двух шагов подряд, и оба
закрываются разными механизмами — понимание связки часто спрашивают как единое целое.

**Шаг 1 — rogue DHCP.** Злоумышленник поднимает свой DHCP-сервер и отвечает быстрее
легитимного, выдавая себя как шлюз и DNS-сервер. Без DHCP snooping клиент с равной
вероятностью получит адрес от настоящего или от поддельного сервера — оба сообщения Offer
одинаково выглядят для клиента. **DHCP snooping** решает это не анализом содержимого
ответа, а топологически: серверные сообщения принимаются только с доверенных портов, а
порт злоумышленника доверенным никто не делал.

**Шаг 2 — ARP spoofing.** Даже если клиент получил правильный адрес шлюза от настоящего
DHCP, злоумышленник может дальше слать поддельные ARP-ответы: «IP шлюза — это мой MAC».
Клиент обновит свой ARP-кэш и начнёт слать весь исходящий трафик злоумышленнику вместо
настоящего шлюза — классический ARP spoofing / ARP cache poisoning. **DAI** останавливает
это на уровне коммутатора: любой ARP-ответ с недоверенного порта сверяется с binding
table (или со статическим ARP ACL), и заявленное соответствие IP↔MAC, не совпадающее с
уже известным легитимным, отбрасывается прежде, чем дойдёт до жертвы.

**Вывод, который проверяют.** Оба шага атаки происходят на одном и том же сегменте, но
защищают от них два **разных, независимых** механизма — отключить только DHCP snooping,
оставив включённым DAI, не спасёт от ARP spoofing со статически прописанным (не через
DHCP) IP-адресом атакующего, и наоборот. К тому же DAI **зависит** от DHCP snooping
(см. врезку выше) — значит, правильный порядок включения: сначала DHCP snooping строит
binding table, потом на неё опирается DAI.

## Диагностика: легитимный сервер со статическим IP не может связаться ни с кем

**Симптом.** После включения Dynamic ARP Inspection на VLAN сервер с адресом, назначенным
вручную (не по DHCP), полностью потерял связь с остальной сетью — хотя раньше работал.

**Что смотрим.** Есть ли у DAI откуда узнать про этот конкретный адрес:

```cli
SW1# show ip dhcp snooping binding | include 192.168.10.50
```

**Что нашли.** Пусто — и это ожидаемо: binding table строится **только** из реальных
DHCP-выдач, а сервер получил адрес не через DHCP. DAI, включённый на VLAN этого сервера,
сверяет каждый его ARP-пакет с таблицей, где записи о нём попросту нет, и отбрасывает всё
как потенциальный спуфинг. Решение — не выключать DAI, а явно разрешить этот адрес через
статический **ARP ACL**, как показано в конфигурации выше (`arp access-list` +
`ip arp inspection filter`): DAI для таких узлов проверяет пакет по ACL вместо
динамической таблицы.

> [!trap] Ловушка
> «DAI сломал сеть — надо отключить» — почти всегда неверный ответ на экзамене. Правильный
> — донастроить исключение (ARP ACL) для узлов, которые законно не участвуют в DHCP, а не
> убирать защиту целиком.

## Диагностика: клиенты перестали получать адреса сразу после включения DHCP snooping

**Симптом.** Включили `ip dhcp snooping` и добавили нужные VLAN, ожидая только защиту от
rogue DHCP, а вместо этого новые клиенты вообще перестали получать адреса — включая тех,
кто обращается к настоящему, легитимному серверу.

**Что смотрим.** Помечен ли доверенным порт, через который приходят ответы настоящего
сервера:

```cli
SW1# show ip dhcp snooping
Switch DHCP snooping is enabled
DHCP snooping is configured on following VLANs: 10,20
Interface              Trusted     Rate limit (pps)
------------------------ ------- ----------------
GigabitEthernet1/0/24    no       unlimited
```

**Что нашли.** Аплинк в сторону настоящего DHCP-сервера остался **недоверенным**
(`Trusted: no`) — а DHCP snooping по умолчанию считает недоверенными **все** порты, пока
администратор явно не пометит нужные. На недоверенном порту отбрасываются именно
серверные сообщения (Offer, Ack, NAK) — то есть коммутатор в этой конфигурации режет
ответы легитимного сервера точно так же, как резал бы ответы rogue DHCP, потому что для
него это один и тот же случай «сервер отвечает не с доверенного порта». Лечится одной
командой на правильном порту:

```cfg
interface GigabitEthernet1/0/24
 ip dhcp snooping trust
```

> [!key] Запомнить
> Забытый `ip dhcp snooping trust` на аплинке — самая частая причина «включили защиту от
> rogue DHCP и сломали DHCP вообще». Доверенный порт нужно назначить явно, DHCP snooping
> не угадывает, где сервер, по топологии сам.

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
- «After enabling DHCP snooping, legitimate clients stop receiving IP addresses. What is
  the most likely misconfiguration?» — не помечен доверенным порт в сторону настоящего
  DHCP-сервера (`ip dhcp snooping trust`); все порты недоверенные по умолчанию.
- «A statically addressed server loses connectivity after DAI is enabled on its VLAN.
  What is the correct fix?» — добавить статический ARP ACL для этого адреса и подключить
  его через `ip arp inspection filter`, а не отключать DAI.
- «Which two mechanisms together stop a combined rogue-DHCP-plus-ARP-spoofing attack, and
  in what order should they be enabled?» — DHCP snooping (сначала, строит binding table)
  и DAI (потом, использует эту таблицу для проверки ARP) — оба нужны, один без другого не
  закрывает обе части атаки.

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
?? После включения DAI на VLAN сервер со статическим IP потерял связь со всеми. Отключать DAI?
!! Нет: добавить его адрес в статический ARP ACL и подключить через ip arp inspection filter — DAI для таких узлов проверяет пакет по ACL, а не по binding table, в которой статических адресов нет.
?? Включили ip dhcp snooping глобально, но клиенты перестали получать адреса даже от настоящего сервера. Что забыли?
!! Пометить доверенным порт в сторону настоящего DHCP-сервера (ip dhcp snooping trust) — по умолчанию все порты недоверенные, и серверные ответы с них отбрасываются наравне с rogue DHCP.
?? Атакующий сначала поднимает rogue DHCP, затем начинает ARP spoofing. Один и тот же механизм остановит оба шага?
!! Нет: rogue DHCP останавливает DHCP snooping (доверенные порты), ARP spoofing — DAI (сверка ARP с binding table); DAI при этом зависит от DHCP snooping и включается после него.
```
