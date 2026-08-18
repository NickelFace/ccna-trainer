---
id: na-01-vlan
dom: NA
title: VLAN и access-порты
lead: Зачем делить коммутатор на логические сети, чем access-порт отличается от voice-порта, что такое VLAN 1 и почему её не любят.
blueprint: ["2.1"]
minutes: 35
match:
  key: ["voice vlan", "switchport access vlan", "default vlan", "vlan database", "access port"]
  re: ["\\bVLAN\\b", "access port", "voice vlan", "default vlan", "switchport mode access", "switchport access vlan", "vlan database", "\\bSVI\\b", "data vlan", "vlan.*assign", "show vlan"]
  not: ["spanning-?tree", "\\bWLAN\\b"]
---

## Что делает VLAN

VLAN превращает один физический коммутатор в несколько логических. Порты, отнесённые к
разным VLAN, **не видят друг друга на втором уровне**, даже если сидят в одной коробке:
broadcast из VLAN 10 не долетит до VLAN 20, ARP не разрешится, обмен без роутера
невозможен.

Что это даёт:

- **Сегментация без нового железа** — бухгалтерия и гости на одном коммутаторе, но в
  разных сетях.
- **Ограничение broadcast-домена** — меньше лишнего трафика на каждом узле.
- **Безопасность и политика** — трафик между VLAN обязан пройти через L3-устройство, где
  на него можно навесить ACL.
- **Гибкость** — переезд сотрудника в другой кабинет не требует перекладывать кабели, надо
  лишь сменить VLAN на порту.

Каждой VLAN обычно соответствует **своя IP-подсеть**. Это не требование стандарта, а
правило проектирования, из которого исходят все вопросы: «VLAN 10 — 192.168.10.0/24,
VLAN 20 — 192.168.20.0/24».

## Диапазоны номеров

| Диапазон | Название | Где хранится |
|---|---|---|
| 1 | default VLAN | vlan.dat |
| 2–1001 | normal range | vlan.dat |
| 1002–1005 | зарезервированы (Token Ring, FDDI) | vlan.dat |
| 1006–4094 | extended range | running-config |

**VLAN 1** особенная: в неё по умолчанию входят все порты, по ней идут служебные протоколы
(CDP, VTP, DTP, PAgP), и её нельзя удалить. Именно поэтому рекомендация — **не
использовать VLAN 1 для пользовательских данных** и увести управление в отдельную VLAN.

## Настройка access-порта

```cfg
Switch(config)# vlan 10
Switch(config-vlan)# name SALES
Switch(config-vlan)# exit
Switch(config)# interface range gigabitethernet0/1 - 8
Switch(config-if-range)# switchport mode access
Switch(config-if-range)# switchport access vlan 10
```

Две строки делают разное, и это спрашивают:

- `switchport mode access` — «этот порт всегда access, никаких переговоров о транке».
  Без неё порт остаётся в `dynamic auto/desirable` и может неожиданно стать транком.
- `switchport access vlan 10` — в какой VLAN он находится.

> [!trap] Ловушка
> Если назначить порту `switchport access vlan 30`, а VLAN 30 на коммутаторе не создана,
> IOS создаст её сам на новых версиях либо оставит порт в состоянии `inactive` — трафик
> не пойдёт. Первое, что проверяют при «порт в нужной VLAN, но не работает», — существует
> ли сама VLAN и не выключена ли она (`shutdown` в режиме vlan).

## Voice VLAN

IP-телефон обычно включён в порт коммутатора, а компьютер — в порт телефона. Один
физический порт несёт два потока: данные ПК и голос телефона.

```cfg
interface GigabitEthernet0/5
 switchport mode access
 switchport access vlan 10        ! данные ПК — нетегированные
 switchport voice vlan 20         ! голос — тегированный, телефон узнаёт номер по CDP/LLDP-MED
 spanning-tree portfast
 mls qos trust cos                ! доверять маркировке телефона
```

Ключевой факт: **голосовой трафик приходит с тегом 802.1Q, пользовательский — без тега**,
хотя формально порт остаётся access. Телефон узнаёт номер голосовой VLAN от коммутатора
через CDP или LLDP-MED. Это же объясняет, почему на такой порт нужен PoE и почему
`portfast` тут уместен — за портом только конечные устройства.

## Как посмотреть, что где

```cli
SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi1/0/9, Gi1/0/10
10   SALES                            active    Gi1/0/1, Gi1/0/2, Gi1/0/3
20   VOICE                            active
99   MGMT                             active

SW1# show interfaces gigabitethernet1/0/1 switchport
Name: Gi1/0/1
Switchport: Enabled
Administrative Mode: static access
Operational Mode: static access
Access Mode VLAN: 10 (SALES)
Voice VLAN: 20
```

Чего в `show vlan brief` **не видно** — транковых портов: они не принадлежат одной VLAN и
в списке портов не отображаются. Отсутствие аплинка в этом выводе не означает поломку.

## Управляющий интерфейс коммутатора

Коммутатор второго уровня сам по себе не имеет IP на портах; чтобы к нему подключаться,
создают **SVI** — виртуальный интерфейс VLAN:

```cfg
interface vlan 99
 ip address 10.0.99.10 255.255.255.0
 no shutdown
!
ip default-gateway 10.0.99.1
```

Требования, из которых строят вопросы: VLAN 99 должна существовать, быть активной, на
коммутаторе должен быть хотя бы один активный порт в этой VLAN (или транк, её несущий), и
нужен `ip default-gateway` (для L2-коммутатора), иначе управление доступно только внутри
своей подсети.

## Типовые неисправности

| Симптом | Причина |
|---|---|
| ПК не получает адрес по DHCP | порт не в той VLAN; VLAN не создана или выключена |
| Два ПК в одной VLAN, но на разных коммутаторах, не видят друг друга | VLAN не разрешена на транке между коммутаторами |
| Порт «мигает» между access и trunk | не зафиксирован `switchport mode access`, работает DTP |
| Телефон работает, ПК за ним — нет | не настроена data VLAN на порту |
| SVI не поднимается | нет активного порта в этой VLAN или VLAN в состоянии shutdown |

## Что спрашивают

- «What is the effect of configuring switchport mode access?» — порт перестаёт
  договариваться о транке и всегда работает в режиме доступа.
- «Which VLAN is untagged on an access port with a voice VLAN?» — данные (data VLAN);
  голос идёт тегированным.
- «Why should VLAN 1 not be used for user data?» — по ней идут служебные протоколы,
  она включена везде по умолчанию, это уязвимая точка.
- «Refer to the exhibit… why can hosts in VLAN 10 not communicate with VLAN 20?» — нужен
  L3: роутер или SVI на L3-коммутаторе.
- «Which command shows the VLAN assigned to a port?» — `show interfaces … switchport` или
  `show vlan brief`.

## Проверь себя

```check
?? Два ПК в разных VLAN на одном коммутаторе. Что нужно, чтобы они общались?
!! Маршрутизация между VLAN: роутер (router-on-a-stick) или SVI на L3-коммутаторе.
?? Порт настроен как access в VLAN 30, но трафик не идёт. Что проверить в первую очередь?
!! Существует ли VLAN 30 на коммутаторе и не находится ли она в состоянии shutdown.
?? Как телефон узнаёт номер голосовой VLAN?
!! От коммутатора по CDP или LLDP-MED.
?? Почему транковый порт не показывается в show vlan brief?
!! Он не принадлежит одной VLAN — там перечислены только access-порты.
?? Что нужно, чтобы SVI управления на L2-коммутаторе поднялся и был доступен из другой подсети?
!! Существующая активная VLAN с активным портом/транком, адрес на interface vlan и ip default-gateway.
```
