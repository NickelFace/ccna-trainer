---
id: na-04-discovery
dom: NA
title: CDP и LLDP
lead: Как устройство узнаёт, кто у него на соседнем конце кабеля, чем открытый LLDP отличается от проприетарного CDP и что читают в их выводе.
blueprint: ["2.3"]
minutes: 25
match:
  key: ["\\bCDP\\b", "\\bLLDP\\b", "discovery protocol"]
  re: ["\\bCDP\\b", "\\bLLDP\\b", "cdp neighbor", "lldp neighbor", "discovery protocol", "LLDP-?MED", "show cdp", "show lldp"]
---

## Зачем протоколы обнаружения

Обычно кабель уже воткнут, а схемы нет. **CDP** и **LLDP** решают именно это: каждое
устройство периодически рассылает соседям объявление о себе — имя, платформа, порт, версия
ПО, адреса. Из этого строится карта соседей и проверяется, туда ли воткнут провод.

| | CDP | LLDP |
|---|---|---|
| Стандарт | проприетарный Cisco | открытый IEEE 802.1AB |
| Включён по умолчанию | да | нет |
| Периодичность | 60 с | 30 с |
| Время жизни записи (holdtime) | 180 с | 120 с |
| Работает с чужим оборудованием | нет | да |
| Расширение для телефонии | CDP несёт голосовую VLAN | LLDP-MED |

> [!key] Запомнить
> Смешанная сеть (Cisco + HPE/Aruba/Juniper) → **LLDP**. Только Cisco → CDP уже работает,
> ничего включать не нужно.

## Команды

```cfg
! CDP
no cdp run                    ! выключить глобально
cdp run                       ! включить глобально
interface gi0/1
 no cdp enable                ! выключить на одном порту

! LLDP
lldp run                      ! включить глобально (по умолчанию выключен)
interface gi0/1
 no lldp transmit             ! не рассылать
 no lldp receive              ! не принимать
```

У LLDP передача и приём управляются **раздельно** — это отдельный вопрос в банке. У CDP
такого разделения нет.

## Чтение вывода

```cli
SW1# show cdp neighbors
Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,
                  D - Remote, C - CVTA, M - Two-port Mac Relay

Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
R1           Gig 0/1          142        R S I     C9200      Gig 0/0/0
SW2          Gig 0/24         168        S I       WS-C2960   Gig 0/1
IP-Phone-12  Gig 0/5          131        H P M     IP Phone   Port 1
```

Что здесь читают:

- **Local Intrfce** — мой порт; **Port ID** — порт соседа. Их постоянно путают в вопросах
  «через какой интерфейс подключён сосед».
- **Capability** — кто это: `R` роутер, `S` коммутатор, `H` хост, `P` телефон.
- **Holdtme** — сколько секунд запись ещё жива без обновления.

`show cdp neighbors detail` (или `show cdp entry *`) добавляет главное — **IP-адрес** и
версию IOS соседа:

```cli
SW1# show cdp neighbors detail
Device ID: R1
Entry address(es):
  IP address: 10.0.0.1
Platform: cisco C9200,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet0/0/0
Version :
Cisco IOS Software, Version 17.9.4
```

У LLDP всё то же самое: `show lldp neighbors` и `show lldp neighbors detail`, плюс
`show lldp entry <имя>`.

## Безопасность

Объявления рассылаются в открытом виде и содержат модель, версию ПО и адрес управления —
подарок разведке. Поэтому рекомендация: **выключать CDP/LLDP на портах к пользователям и
во внешнюю сторону**, оставляя между инфраструктурными устройствами.

Исключение — порты с IP-телефонами: там CDP/LLDP-MED нужен, чтобы телефон получил номер
голосовой VLAN и согласовал PoE.

## Где это выручает на экзамене

Вопросы с exhibit-ом часто дают только вывод `show cdp neighbors` и просят восстановить
топологию: кто с кем соединён и каким портом. Алгоритм простой — берёшь **Local Intrfce**
как свой конец, **Port ID** как чужой, `Capability` подсказывает тип устройства.

Второй сюжет: сосед не виден. Причины по порядку — CDP выключен глобально или на порту, у
соседа другое оборудование (нужен LLDP), либо порт вовсе не поднят.

## Разбор задачи: восстанавливаем топологию по трём выводам

Дано три вывода `show cdp neighbors`, схемы к вопросу нет — нужно понять, кто с кем и
через какие порты соединён.

```cli
SW1# show cdp neighbors
Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
SW2          Gig 0/24         165        S I       WS-C2960   Gig 0/24
R1           Gig 0/1          140        R S I     C9200      Gig 0/0/1

SW2# show cdp neighbors
Device ID    Local Intrfce   Holdtme  Capability   Platform   Port ID
SW1          Gig 0/24         170        S I       WS-C2960   Gig 0/24
SW3          Gig 0/23         155        S I       WS-C2960   Gig 0/24

R1# show cdp neighbors
Device ID    Local Intrfce      Holdtme  Capability   Platform   Port ID
SW1          Gig 0/0/1           138        S I       WS-C2960   Gig 0/1
```

Читаем каждую строку как пару «мой порт (Local Intrfce) — порт соседа (Port ID)» и
складываем линки: SW1 `Gi0/24` ↔ SW2 `Gi0/24`; SW2 `Gi0/23` ↔ SW3 `Gi0/24`; SW1 `Gi0/1` ↔
R1 `Gi0/0/1`. Обрати внимание, что R1 в своей таблице видит только SW1 — SW2 и SW3 для
него не соседи по CDP: **протокол обнаружения работает только на один хоп**, и R1 просто
физически не подключён напрямую ни к SW2, ни к SW3, хотя может маршрутизировать до сетей
за ними. Итоговая топология собирается как цепочка: `R1 — SW1 — SW2 — SW3`.

> [!trap] Ловушка
> «R1 не видит SW3 в CDP — значит, между ними нет связи вообще» — неверно. CDP/LLDP
> показывают только **непосредственных** соседей по кабелю; маршрутизация до дальних сетей
> через несколько хопов через CDP не отображается никак, для неё смотрят таблицу
> маршрутизации.

## Диагностика: два коммутатора Cisco соединены, но друг друга не видят по CDP

**Симптом.** Кабель физически рабочий (`show interfaces` — `up/up`, трафик ходит), но ни
на одном из двух коммутаторов сосед не появляется в `show cdp neighbors`.

**Что смотрим.** Включён ли CDP вообще — глобально и на конкретном порту:

```cli
SW1# show cdp
% CDP is not enabled

SW2# show run interface gi0/1 | include cdp
 no cdp enable
```

**Что нашли.** Здесь сразу две независимые причины на двух разных коммутаторах: у SW1 CDP
выключен **глобально** (`no cdp run` где-то в конфигурации — редкость, но встречается в
защищённых периметрах), у SW2 CDP выключен **только на этом порту** (`no cdp enable`).
Для соседства обеим сторонам нужно, чтобы CDP был включён и глобально, и на интерфейсе
одновременно — выключение любого из двух уровней с любой стороны линка полностью гасит
обнаружение в этом направлении.

## Диагностика: IP-телефон не получает голосовую VLAN

**Симптом.** Компьютер, подключённый напрямую к порту коммутатора, работает нормально;
такой же ПК за IP-телефоном на соседнем порту выходит в сеть, а сам телефон не
регистрируется на сервере телефонии.

**Что смотрим.** Присутствие протокола обнаружения на этом конкретном порту — именно
через него телефон узнаёт номер voice VLAN (см. главу про VLAN и voice VLAN):

```cli
SW1# show cdp neighbors interface gi1/0/5
% No CDP neighbors found on interface GigabitEthernet1/0/5

SW1# show run interface gi1/0/5 | include cdp|lldp
 no cdp enable
```

**Что нашли.** На порту отключён CDP (часто — «для безопасности», по общей рекомендации
выключать обнаружение на портах к конечным устройствам), но именно на портах с
IP-телефонами это правило **не применяют**: без CDP (или LLDP-MED, если телефон его
поддерживает) телефон не получает информацию о voice VLAN и остаётся в data VLAN, где
сервер телефонии его не ждёт. ПК за телефоном при этом работает нормально, потому что ему
для обычного доступа в сеть voice VLAN не нужна вовсе — асимметрия симптома (ПК работает,
телефон нет) и указывает точно на эту причину.

## Что спрашивают

- «Which protocol is open standard and must be enabled manually?» — LLDP.
- «What information does show cdp neighbors provide?» — имя соседа, локальный порт, порт
  соседа, платформа, capability; **IP-адрес только в detail**.
- «Which command displays the IOS version of a neighbor?» — `show cdp neighbors detail`.
- «An engineer must discover devices from another vendor» — включить `lldp run`.
- «Why disable CDP on a port facing an untrusted network?» — не раскрывать модель, версию
  и адрес управления.
- Drag-and-drop: сопоставить свойства (30/60 секунд, открытый/проприетарный, включён по
  умолчанию) с CDP и LLDP.
- «A router does not see a switch two hops away in `show cdp neighbors`. Is this a
  problem?» — нет: обнаружение работает только на один физический хоп, дальние устройства
  в него не попадают, это нормально.
- «Two Cisco switches are physically connected and passing traffic, but neither shows the
  other as a CDP neighbor. What are two possible causes?» — CDP выключен глобально на
  одном из них, либо выключен именно на этом порту (`no cdp enable`) — оба уровня
  проверяются отдельно.
- «A PC behind an IP phone works normally, but the phone itself never registers. What
  should be checked on the switch port?» — включён ли CDP (или LLDP-MED) на этом порту:
  именно через него телефон узнаёт номер voice VLAN.

## Проверь себя

```check
?? Какой протокол работает с оборудованием других вендоров и нужно ли его включать?
!! LLDP; по умолчанию он выключен, включается командой lldp run.
?? Где в выводе show cdp neighbors искать порт соседа?
!! В колонке Port ID; Local Intrfce — это свой порт.
?? Нужен IP-адрес соседа. Какая команда?
!! show cdp neighbors detail (или show cdp entry *).
?? Интервал объявлений и holdtime у CDP?
!! 60 и 180 секунд.
?? Почему CDP отключают на портах к пользователям?
!! Объявления раскрывают модель, версию ПО и адрес управления — это разведданные для атакующего.
?? R1 подключён к SW1, а SW1 подключён к SW2. Появится ли SW2 в show cdp neighbors на R1?
!! Нет: CDP/LLDP видят только устройства на другом конце своего же кабеля, за один хоп; SW2 для R1 — сосед соседа, а не прямой сосед.
?? Кабель между двумя Cisco-коммутаторами исправен и трафик ходит, но CDP-соседства нет ни в одну сторону. Где искать причину на каждом из них?
!! На каждом коммутаторе отдельно: включён ли CDP глобально (show cdp) и включён ли он именно на этом интерфейсе (no cdp enable в конфигурации порта) — оба уровня независимы.
?? IP-телефон не регистрируется, хотя ПК за ним работает нормально. На какой протокол в первую очередь смотреть на этом порту?
!! На CDP или LLDP-MED — именно через них телефон получает номер голосовой VLAN; выключенное на этом порту обнаружение оставляет телефон в обычной data VLAN.
```
```
