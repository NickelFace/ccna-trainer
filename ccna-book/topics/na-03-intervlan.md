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

## Разбор задачи: пошаговая диагностика по лестнице пингов

Топология: коммутатор SW1 (L2) с VLAN 10 и VLAN 20, транк до роутера R1, на R1
подынтерфейсы `Gi0/0.10` и `Gi0/0.20`. Хост A в VLAN 10 (`192.168.10.50`) не может
достучаться до хоста B в VLAN 20 (`192.168.20.50`).

**Шаг 1 — хост A пингует свой шлюз `192.168.10.1`.**

```cli
A> ping 192.168.10.1
Reply from 192.168.10.1: bytes=32 time=1ms
```

Прошло — адрес, маска и шлюз у хоста A верны, порт в правильной VLAN, подынтерфейс
`Gi0/0.10` поднят. Если бы этот шаг не прошёл, искать причину нужно было бы **только** в
пределах VLAN 10: адресация хоста, состояние порта, доходит ли VLAN до транка.

**Шаг 2 — хост A пингует шлюз чужой VLAN `192.168.20.1`.**

```cli
A> ping 192.168.20.1
Request timed out.
```

Не прошло — а должно было пройти всегда, даже без всякой связи с хостом B: шлюз чужой
VLAN — это тоже просто адрес на транке, физически доступный отовсюду, где транк несёт обе
VLAN. Раз не отвечает, проблема не в хосте B и не в VLAN 20 целиком, а в самой
маршрутизации между VLAN 10 и 20 на R1 — переходим к его конфигурации, а не идём дальше по
лестнице.

```cli
R1# show ip interface brief | include GigabitEthernet0/0
GigabitEthernet0/0        unassigned      YES unset  up      up
GigabitEthernet0/0.10     192.168.10.1    YES manual up      up
GigabitEthernet0/0.20     192.168.20.1    YES manual up      up
```

Оба подынтерфейса `up/up` — значит дело не в забытом `no shutdown`. Следующая по частоте
причина в этой точке — **encapsulation**: если на `Gi0/0.20` вместо `encapsulation dot1Q
20` по ошибке стоит `encapsulation dot1Q 2`, подынтерфейс поднимется и будет отвечать на
свой собственный адрес локально, но кадры от VLAN 20 с транка на него попадать не будут —
несовпадение видно только построчной сверкой конфигурации, не из `show ip interface
brief`.

> [!key] Запомнить
> Лестница пингов работает именно потому, что каждый шаг проверяет ровно один
> дополнительный компонент. Шаг 2 не прошёл — значит, шаг 1 уже подтвердил исправность
> VLAN 10 целиком, и искать нужно только в маршрутизации между VLAN, не возвращаясь назад
> к адресации хоста A.

## Диагностика: часть трафика между VLAN не маршрутизируется на транке с изменённой native VLAN

**Симптом.** Router-on-a-stick работает для всех VLAN кроме одной — обычно той, что
назначена native VLAN на транке; хосты этой VLAN не могут достучаться до остальных.

**Что смотрим.** Настройку подынтерфейса, отвечающего за native VLAN:

```cli
R1# show running-config interface gi0/0.99
interface GigabitEthernet0/0.99
 encapsulation dot1Q 99
 ip address 192.168.99.1 255.255.255.0
```

**Что нашли.** Не хватает ключевого слова `native` в конце строки `encapsulation`. Кадры
этой VLAN приходят на транк **без тега** (по определению native VLAN, см. главу про
транки), а подынтерфейс без явного `native` ожидает кадры **с** тегом dot1Q 99 и
отбрасывает нетегированные как непонятные. Правильная строка:

```cfg
interface GigabitEthernet0/0.99
 encapsulation dot1Q 99 native
```

Без этого уточнения именно native VLAN всегда будет исключением в router-on-a-stick —
остальные VLAN, идущие с тегами, работают нормально, что и создаёт обманчивую картину
«всё сломано только у одной VLAN».

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
- «A host can ping its own gateway but not the gateway of another VLAN on the same
  router-on-a-stick. What should be checked first?» — не адресацию хоста (она уже
  подтверждена шагом 1), а конфигурацию подынтерфейсов на роутере: encapsulation, IP,
  состояние up/up.
- «Inter-VLAN routing works for every VLAN except the one carried untagged on the trunk.
  What is missing?» — ключевое слово `native` в конце `encapsulation dot1Q <vlan>
  native` на соответствующем подынтерфейсе.
- «Why is testing the gateway of the remote VLAN a more precise diagnostic step than
  testing the remote host directly?» — шлюз чужой VLAN отвечает независимо от состояния
  удалённого хоста, поэтому провал именно на этом шаге указывает на саму маршрутизацию, а
  не на хост B или его настройки.

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
?? Хост A пингует свой шлюз успешно, шлюз соседней VLAN — нет. Какой вывод уже можно сделать про VLAN хоста A?
!! Она точно исправна целиком: адресация, порт и подынтерфейс хоста A уже подтверждены первым шагом; искать дальше нужно только в маршрутизации между VLAN, не возвращаясь к хосту A.
?? Router-on-a-stick маршрутизирует все VLAN кроме native. Что забыли в конфигурации соответствующего подынтерфейса?
!! Ключевое слово native в конце encapsulation dot1Q <vlan> native — без него подынтерфейс ждёт тегированные кадры и отбрасывает нетегированный трафик native VLAN.
?? Encapsulation на подынтерфейсе Gi0/0.20 по ошибке настроена как dot1Q 2 вместо dot1Q 20. Как это выглядит в show ip interface brief?
!! Подынтерфейс будет up/up и отвечать на свой собственный адрес — ошибка не видна в этой команде, нужна построчная сверка running-config с реальным номером VLAN на транке.
```
