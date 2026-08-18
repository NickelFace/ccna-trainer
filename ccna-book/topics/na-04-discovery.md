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
                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone

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
```
