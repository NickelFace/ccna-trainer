---
id: na-03-intervlan
dom: NA
title: Маршрутизация между VLAN
lead: Router-on-a-stick с подынтерфейсами, SVI на L3-коммутаторе и routed port — три способа связать VLAN и признаки, по которым выбирают нужный.
blueprint: ["2.1"]
minutes: 30
match:
  key: ["inter-?vlan", "router-on-a-stick", "subinterface", "encapsulation dot1q \\d", "no switchport", "ip routing", "interface vlan \\d"]
  re: ["inter-?vlan", "router-on-a-stick", "subinterface", "encapsulation dot1q \\d", "\\bSVI\\b", "interface vlan \\d", "ip routing", "no switchport", "routed port", "layer 3 switch", "route between vlan", "communicate between vlan", "different vlans?.*communicate", "gateway for.*vlan"]
---

## Три способа и когда какой

| Способ | Как выглядит | Когда выбирают |
|---|---|---|
| Отдельный физический порт на VLAN | по кабелю от роутера на каждую VLAN | почти никогда: порты кончатся на третьей VLAN |
| **Router-on-a-stick** | один транк до роутера, подынтерфейсы | мало VLAN, роутер уже есть, трафика немного |
| **SVI на L3-коммутаторе** | `interface vlan N` прямо на коммутаторе | нормальный кампус: маршрутизация на скорости порта |

Отдельно стоит **routed port** — порт L3-коммутатора, выведенный из коммутации командой
`no switchport`: он ведёт себя как интерфейс роутера и нужен для линков между L3-железками,
а не для VLAN пользователей.

## Router-on-a-stick

```cfg
! На коммутаторе — обычный транк
interface GigabitEthernet0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,20

! На роутере — подынтерфейсы, по одному на VLAN
interface GigabitEthernet0/0
 no shutdown                      ! физический интерфейс должен быть поднят
!
interface GigabitEthernet0/0.10
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
!
interface GigabitEthernet0/0.20
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
```

Что здесь ломается чаще всего:

1. **Забыли `no shutdown` на физическом интерфейсе** — подынтерфейсы не поднимутся.
2. **Номер подынтерфейса ≠ номеру VLAN** — работает, но путает; VLAN задаёт именно
   `encapsulation dot1Q`, а не цифра после точки.
3. **Native VLAN** требует особой записи: `encapsulation dot1Q 99 native`, иначе
   нетегированный трафик роутер не примет.
4. Адрес подынтерфейса должен быть **шлюзом по умолчанию** для хостов этой VLAN.

Ограничение схемы очевидно: весь межвлановый трафик дважды проходит через один физический
линк (вверх и вниз). Это и есть узкое место, о котором спрашивают.

## SVI на L3-коммутаторе

```cfg
Switch(config)# ip routing                 ! без этого коммутатор не маршрутизирует
Switch(config)# interface vlan 10
Switch(config-if)# ip address 192.168.10.1 255.255.255.0
Switch(config-if)# no shutdown
Switch(config)# interface vlan 20
Switch(config-if)# ip address 192.168.20.1 255.255.255.0
Switch(config-if)# no shutdown
```

**`ip routing` — команда, которую забывают в половине задач.** Без неё SVI поднимутся,
адреса будут отвечать, но трафик между VLAN не пойдёт, и в таблице маршрутизации не
появится ничего, кроме connected.

Условия, при которых SVI переходит в up/up:

- VLAN существует и не в shutdown;
- в этой VLAN есть **хотя бы один активный порт** (access в up или транк, её несущий);
- сам `interface vlan` не в shutdown.

Отсюда типовой вопрос: «SVI показывает down/down, хотя адрес настроен» — почти всегда нет
активных портов в VLAN или VLAN не создана.

```cli
SW1# show ip route
      192.168.10.0/24 is directly connected, Vlan10
      192.168.20.0/24 is directly connected, Vlan20
SW1# show ip interface brief | include Vlan
Vlan10   192.168.10.1    YES manual up      up
Vlan20   192.168.20.1    YES manual up      up
```

## Routed port

```cfg
interface GigabitEthernet1/0/24
 no switchport
 ip address 10.0.0.1 255.255.255.252
```

Порт перестаёт быть частью VLAN и получает собственный IP. Так соединяют L3-коммутатор с
роутером или с другим L3-коммутатором: без VLAN, без STP, чистый третий уровень.

## Проверка связности и типовая диагностика

Порядок, который ждут в вопросах на устранение неисправностей:

1. Хост пингует **свой шлюз** (адрес SVI/подынтерфейса). Не проходит — проблема в VLAN,
   порте или адресации хоста.
2. Хост пингует **шлюз чужой VLAN**. Не проходит — маршрутизация не включена (`ip
   routing`) или интерфейс down.
3. Хост пингует **хост в чужой VLAN**. Не проходит на этом шаге — смотри firewall/ACL на
   маршрутизирующем устройстве и шлюз по умолчанию на удалённом хосте.

| Симптом | Причина |
|---|---|
| Пинг до своего шлюза не идёт | порт не в той VLAN, неверная маска/адрес, SVI выключен |
| Свой шлюз пингуется, чужой — нет | нет `ip routing` (или на роутере не поднят физический интерфейс) |
| Шлюзы пингуются, хосты — нет | у удалённого хоста не прописан шлюз, либо ACL |
| Всё работает, но медленно | router-on-a-stick упёрся в полосу одного линка |

## Что спрашивают

- «Which command is required for a Layer 3 switch to route between VLANs?» — `ip routing`.
- «Which configuration creates inter-VLAN routing over a single link?» — подынтерфейсы с
  `encapsulation dot1Q`.
- «An SVI is down/down. Why?» — нет активного порта в VLAN или VLAN не существует.
- «What is the purpose of the no switchport command?» — сделать порт маршрутизируемым
  (routed port).
- «Refer to the exhibit… hosts in VLAN 10 cannot reach VLAN 20» — искать отсутствие
  `ip routing`, неверный `encapsulation`, транк без нужной VLAN или неправильный шлюз на
  хосте.

## Проверь себя

```check
?? Что задаёт принадлежность подынтерфейса к VLAN — его номер или команда?
!! Команда encapsulation dot1Q; номер подынтерфейса — просто удобная нумерация.
?? SVI настроен, адрес есть, состояние down/down. Что смотреть?
!! Существует ли VLAN, не в shutdown ли она и есть ли в ней хотя бы один активный порт или транк.
?? Хост пингует свой шлюз, но не шлюз соседней VLAN на том же коммутаторе. Чего не хватает?
!! Команды ip routing — коммутатор не маршрутизирует между своими SVI.
?? Чем routed port отличается от SVI?
!! Routed port — физический порт вне коммутации со своим IP; SVI — виртуальный интерфейс целой VLAN.
?? Почему router-on-a-stick плохо масштабируется?
!! Весь межвлановый трафик проходит через один физический линк дважды — он и становится узким местом.
```
