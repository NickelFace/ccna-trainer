---
id: na-05-etherchannel
dom: NA
title: EtherChannel
lead: Как несколько линков превращаются в один логический, чем LACP отличается от PAgP, какие режимы соберут канал и почему он рассыпается.
blueprint: ["2.4"]
minutes: 30
match:
  key: ["etherchannel", "port-?channel", "\\bLACP\\b", "\\bPAgP\\b", "channel-group"]
  re: ["etherchannel", "port-?channel", "\\bLACP\\b", "\\bPaGP\\b", "\\bPAgP\\b", "channel-group", "link aggregation", "\\bLAG\\b", "active.*passive.*mode", "load.?balanc.*(link|channel)"]
---

## Зачем объединять линки

Два коммутатора соединены двумя кабелями. Без агрегации spanning tree заблокирует второй —
резерв есть, полосы нет. **EtherChannel** объединяет физические порты в один логический:

- **Полоса складывается** — четыре гигабитных линка дают 4 Гбит/с суммарно.
- Для STP это **один порт**, поэтому блокировки нет и петли не возникает.
- Отказ одного линка не роняет канал — трафик перераспределяется по оставшимся,
  переключение мгновенное, без пересчёта дерева.

До 8 активных портов в канале (плюс до 8 в резерве при LACP).

## Протоколы согласования

| | PAgP | LACP | Static |
|---|---|---|---|
| Стандарт | Cisco | IEEE 802.3ad | — |
| Режимы | `auto`, `desirable` | `passive`, `active` | `on` |
| Проверка совместимости | да | да | нет |
| Резервные порты | нет | до 8 | нет |

Таблица совместимости, которую спрашивают напрямую:

| Сторона A | Сторона B | Канал |
|---|---|---|
| LACP `active` | `active` | да |
| LACP `active` | `passive` | да |
| LACP `passive` | `passive` | **нет** |
| PAgP `desirable` | `desirable` | да |
| PAgP `desirable` | `auto` | да |
| PAgP `auto` | `auto` | **нет** |
| `on` | `on` | да |
| `on` | `active`/`desirable` | **нет** |

> [!key] Запомнить
> Логика одна на оба протокола: **пассивный с пассивным не договорится**, а режим `on` не
> говорит вообще ни с кем — с ним другая сторона тоже обязана быть `on`.

Смешивать LACP и PAgP на одном канале нельзя.

## Настройка

```cfg
interface range gigabitethernet0/1 - 2
 shutdown
 channel-group 1 mode active          ! LACP
 no shutdown
!
interface port-channel 1
 switchport mode trunk
 switchport trunk allowed vlan 10,20
```

Порядок важен: настройки логического интерфейса `port-channel` — это то, что реально
работает; физические порты обязаны быть **одинаковыми** по параметрам.

Что должно совпадать на всех портах канала (иначе порт не войдёт и будет `suspended`):

- скорость и дуплекс;
- режим порта (все access в одной VLAN либо все trunk);
- список разрешённых VLAN и native VLAN на транке;
- тип (L2 или L3).

## Проверка

```cli
SW1# show etherchannel summary
Flags:  D - down        P - bundled in port-channel
        I - stand-alone s - suspended
        R - Layer3      S - Layer2
        U - in use      f - failed to allocate aggregator

Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------
1      Po1(SU)         LACP      Gi0/1(P)   Gi0/2(P)
2      Po2(SD)         LACP      Gi0/3(s)   Gi0/4(s)
```

Расшифровка флагов — половина вопросов по теме:

- `SU` — L2-канал, работает. `SD` — канал down.
- `(P)` — порт в связке, всё хорошо.
- `(s)` — suspended: параметры не совпали или другая сторона молчит.
- `(I)` — stand-alone: порт остался сам по себе, канала нет.
- `(D)` — порт down.

`show etherchannel port-channel` и `show interfaces port-channel 1` дополняют картину.

## Балансировка

Трафик распределяется **по потокам, а не по пакетам** — иначе пакеты одной сессии
приходили бы вразнобой. Хэш считается от адресов, по умолчанию — от source MAC:

```cfg
port-channel load-balance src-dst-ip
```

```cli
SW1# show etherchannel load-balance
EtherChannel Load-Balancing Configuration:
        src-dst-ip
```

Отсюда неочевидное следствие, которое любят спрашивать: **один поток никогда не получит
больше полосы одного физического линка**. Копирование одного большого файла между двумя
серверами через канал 4×1G пойдёт на 1 Гбит/с. Если весь трафик идёт через один роутер,
хэш по MAC даст перекос — меняют алгоритм на `src-dst-ip`.

## L3 EtherChannel

На L3-коммутаторе канал можно вывести из коммутации:

```cfg
interface port-channel 1
 no switchport
 ip address 10.0.0.1 255.255.255.252
!
interface range gigabitethernet0/1 - 2
 no switchport
 channel-group 1 mode active
```

Так соединяют distribution-коммутаторы: полоса складывается, STP не участвует вовсе.

## Что спрашивают

- «Which two modes will form an EtherChannel?» — по таблице совместимости.
- «What is the result when both sides are set to auto/passive?» — канал не соберётся.
- «Refer to the exhibit… why is the port suspended?» — несовпадение параметров портов
  (VLAN, дуплекс, скорость, режим) или отсутствие согласования с той стороны.
- «Which protocol is the industry standard?» — LACP (802.3ad).
- «Why does a single file transfer not use the full channel bandwidth?» — балансировка по
  потокам, один поток живёт на одном физическом линке.
- «What must match on all ports in a channel?» — скорость, дуплекс, режим, VLAN.

## Проверь себя

```check
?? LACP passive с обеих сторон — канал соберётся?
!! Нет, кто-то должен быть active. То же правило у PAgP для auto/auto.
?? Что означает флаг (s) у порта в show etherchannel summary?
!! Suspended: параметры порта не совпали с каналом или согласование не прошло.
?? Копирование файла между двумя серверами через 4×1G даёт 1 Гбит/с. Это поломка?
!! Нет: балансировка идёт по потокам, один поток не выходит за пределы одного физического линка.
?? Как STP видит EtherChannel из четырёх линков?
!! Как один логический порт — поэтому ничего не блокируется и петли не возникает.
?? На каком интерфейсе задают режим транка для канала?
!! На логическом port-channel; физические порты должны быть настроены одинаково.
```
