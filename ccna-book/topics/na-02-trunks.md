---
id: na-02-trunks
dom: NA
title: Транки 802.1Q и native VLAN
lead: Как несколько VLAN живут в одном кабеле, что делает тег, чем опасна несовпадающая native VLAN и почему DTP лучше выключить.
blueprint: ["2.2"]
minutes: 35
match:
  key: ["trunk", "802\\.1Q", "native vlan", "\\bDTP\\b"]
  re: ["trunk", "802\\.1Q", "native vlan", "\\bDTP\\b", "dynamic desirable", "dynamic auto", "allowed vlan", "tagg?ed", "encapsulation dot1q", "switchport mode trunk", "show interfaces trunk"]
  not: ["etherchannel", "spanning-?tree root"]
---

## Зачем нужен транк

Access-порт несёт **одну** VLAN. Если между двумя коммутаторами надо провести десять VLAN,
тянуть десять кабелей глупо — вместо этого один порт объявляют **транком**, и он несёт
кадры всех разрешённых VLAN.

Чтобы принимающая сторона поняла, к какой VLAN относится кадр, отправитель добавляет
**тег 802.1Q** — 4 байта внутрь заголовка Ethernet:

```txt
 обычный кадр:  | DA | SA |     Type | Payload | FCS |
 с тегом .1Q:   | DA | SA | TPID VID | Type | Payload | FCS |
                          └ 4 байта: 0x8100 + приоритет + VLAN ID
```

Тег содержит **VLAN ID** (12 бит, отсюда предел 4094) и поле приоритета **PCP/CoS**
(3 бита) — им пользуется QoS на канальном уровне. Из-за вставки 4 байт кадр может стать
1522 байта — коммутаторы это допускают (baby giant).

Тег живёт **только внутри транка**: перед выдачей кадра на access-порт коммутатор его
снимает. Конечное устройство о VLAN обычно не знает вовсе.

## Native VLAN

В 802.1Q одна VLAN на транке ходит **без тега** — это **native VLAN**, по умолчанию
VLAN 1. Всё, что пришло на транк без тега, коммутатор относит к native VLAN.

```cfg
interface GigabitEthernet0/1
 switchport trunk encapsulation dot1q   ! на коммутаторах, где есть выбор ISL/dot1q
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,99
 switchport nonegotiate
```

Правила, которые проверяют:

- **Native VLAN должна совпадать на обоих концах.** Не совпадает — трафик одной VLAN
  «перетекает» в другую, а CDP громко жалуется в лог: `%CDP-4-NATIVE_VLAN_MISMATCH`.
- Хорошая практика — сделать native VLAN отдельной неиспользуемой (например, 999) и не
  оставлять её равной VLAN 1: это закрывает атаку **VLAN hopping** двойным тегированием.
- Можно вообще потребовать тег для всех: `vlan dot1q tag native`.

> [!trap] Ловушка
> Несовпадение native VLAN **не роняет транк** — он остаётся up, и симптом выглядит как
> «часть трафика ходит не туда» или «в двух VLAN видно чужой broadcast». Ищи это в
> вопросах, где линк up, а связность странная.

## Список разрешённых VLAN

По умолчанию транк несёт **все** VLAN (1–4094). Ограничение задаётся явно:

```cfg
switchport trunk allowed vlan 10,20,99      ! ровно эти
switchport trunk allowed vlan add 30        ! добавить к списку
switchport trunk allowed vlan remove 20     ! убрать
switchport trunk allowed vlan all           ! вернуть все
```

Классическая ошибка — набрать `allowed vlan 30` вместо `add 30`: список заменится целиком,
и всё остальное мгновенно отвалится. В вопросах на troubleshooting это выглядит как «после
добавления новой VLAN перестали работать старые».

VLAN должна быть разрешена **на всех транках по пути**, иначе связь между её узлами на
разных коммутаторах не соберётся.

## DTP: как порты договариваются

**DTP** (Dynamic Trunking Protocol) — проприетарный протокол Cisco, которым порты
согласуют режим.

| Режим | Что делает | Станет транком с |
|---|---|---|
| `access` | всегда access | ни с кем |
| `trunk` | всегда транк, шлёт DTP | trunk, desirable, auto |
| `dynamic desirable` | активно предлагает транк | trunk, desirable, auto |
| `dynamic auto` | ждёт предложения | trunk, desirable |

Два порта в `dynamic auto` транком **не станут** — оба ждут инициативы. Это самый частый
расчётный вопрос по таблице.

Практика безопасности: явно задавать режим и добавлять `switchport nonegotiate`, чтобы
порт не рассылал DTP-кадры. На порту к пользователю DTP — это возможность атаки switch
spoofing: злоумышленник притворяется коммутатором и получает все VLAN.

## Проверка

```cli
SW1# show interfaces trunk
Port        Mode         Encapsulation  Status        Native vlan
Gi0/1       on           802.1q         trunking      999

Port        Vlans allowed on trunk
Gi0/1       10,20,99

Port        Vlans allowed and active in management domain
Gi0/1       10,20,99

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/1       10,20,99
```

Четыре блока читаются сверху вниз как воронка: что разрешено → что из этого существует и
активно → что реально передаётся (не заблокировано STP). Если VLAN есть в первом блоке, но
нет в последнем — её порт заблокирован spanning tree, и это не проблема транка.

## Связка с маршрутизацией

Транк до роутера — основа схемы **router-on-a-stick**: физический интерфейс делится на
подынтерфейсы, по одному на VLAN. Об этом отдельная глава, но помни: на стороне
коммутатора это обычный транк, а на роутере — `encapsulation dot1q <vlan>` в каждом
подынтерфейсе, причём для native VLAN добавляют ключевое слово `native`.

## Что спрашивают

- «Which two commands configure a trunk?» — `switchport mode trunk` (+ `encapsulation
  dot1q` там, где есть выбор).
- «What happens when native VLANs do not match?» — трафик native VLAN одной стороны
  попадает в другую VLAN; CDP выдаёт ошибку, линк остаётся up.
- «Two ports are set to dynamic auto. What is the result?» — оба останутся access.
- «Which VLANs traverse the trunk?» — по выводу `show interfaces trunk`, последний блок.
- «Why configure a dedicated native VLAN?» — защита от double-tagging VLAN hopping.
- «An engineer added VLAN 30 with switchport trunk allowed vlan 30. What happened?» —
  список заменён, остальные VLAN больше не проходят.

## Проверь себя

```check
?? Сколько байт добавляет тег 802.1Q и что в нём лежит?
!! Четыре байта: TPID, приоритет CoS и VLAN ID (12 бит).
?? Кадр пришёл на транк без тега. Куда его отнесёт коммутатор?
!! В native VLAN этого транка.
?? Порт A — dynamic desirable, порт B — dynamic auto. Транк соберётся?
!! Да: desirable активно предлагает, auto соглашается.
?? Как узнать, какие VLAN реально ходят по транку прямо сейчас?
!! show interfaces trunk, последний блок — «in spanning tree forwarding state and not pruned».
?? Чем опасна native VLAN, совпадающая с пользовательской?
!! Double tagging: кадр с двумя тегами теряет внешний тег на первом коммутаторе и попадает в чужую VLAN.
```
