---
id: na-08-wlan-infra
dom: NA
title: Проводная часть беспроводной сети
lead: Как включают точки и контроллер: access или trunk, LAG на WLC, порты и интерфейсы контроллера, management и dynamic interface.
blueprint: ["2.7"]
minutes: 30
match:
  key: ["dynamic interface", "distribution system port", "\\bLAG\\b", "service port", "virtual interface"]
  re: ["management interface", "dynamic interface", "virtual interface", "service port", "\\bLAG\\b", "distribution system port", "switch port.*access point", "access point.*switch port", "trunk.*access point", "wlan.*vlan mapping", "wireless.*vlan.*map", "controller.*port.*configur"]
---

## Как подключают точку доступа

Правило простое и его любят проверять:

- **Local mode (обычная точка на CAPWAP)** — порт коммутатора настраивают **access** в
  той VLAN, где живут сами точки. Весь клиентский трафик идёт внутри CAPWAP-туннеля, VLAN
  клиентов на этом порту не нужны.
- **FlexConnect с локальной коммутацией** или **autonomous-точка** — порт настраивают
  **trunk**: клиентские VLAN выходят в сеть прямо здесь.

Плюс питание: точке нужен **PoE** (802.3af для простых, 802.3at/bt для 802.11ac/ax) либо
внешний инжектор.

```cfg
! Порт к lightweight-точке в local mode
interface GigabitEthernet1/0/10
 description AP-2F-01
 switchport mode access
 switchport access vlan 60          ! VLAN точек доступа
 spanning-tree portfast
 spanning-tree bpduguard enable
```

> [!trap] Ловушка
> «Точка в local mode → транк» — самый частый неверный ответ. Транк нужен там, где кадры
> клиентов выходят в проводную сеть на самой точке, а в local mode они выходят на
> контроллере.

## Порты контроллера

У WLC понятия «порт» и «интерфейс» разведены.

| Порт | Назначение |
|---|---|
| **Distribution system port** | основной физический порт в сеть; несёт CAPWAP и клиентский трафик; обычно **trunk** |
| **Service port** | отдельный порт управления «вне полосы», своя подсеть, без маршрутизации |
| **Console** | локальный доступ к CLI |
| **Redundancy port** | связь с резервным контроллером (HA SSO) |

Порт коммутатора, куда включён WLC, — **транк**, потому что контроллер отдаёт трафик
разных WLAN в разные VLAN.

**LAG** на WLC объединяет физические порты в один логический (аналог EtherChannel). На
стороне коммутатора это EtherChannel в режиме **`on`** — контроллер не участвует в LACP,
и это отдельный экзаменационный факт. При включении LAG контроллер требует перезагрузки, а
все интерфейсы автоматически привязываются к логической группе.

## Интерфейсы контроллера

| Интерфейс | Что это |
|---|---|
| **Management** | адрес, по которому точки строят CAPWAP и администратор заходит в GUI |
| **Virtual** | несуществующий адрес (классически 192.0.2.1) для DHCP-relay, веб-аутентификации и мобильности |
| **Dynamic** | интерфейс, привязанный к VLAN клиентской сети; на него ложится WLAN |
| **Service port** | адрес сервисного порта, отдельная подсеть |
| **AP-manager** | на старых платформах отвечал за CAPWAP-туннели; на современных слит с management |

Логика связи: **WLAN (SSID) → dynamic interface → VLAN**. Именно так беспроводная сеть
попадает в нужную проводную подсеть, и именно этого не хватает, когда «клиент
подключается, но не получает адрес».

## Что должно совпасть, чтобы всё заработало

1. Точка получает адрес (обычно DHCP в VLAN точек) и находит контроллер — статикой,
   DHCP option 43 или DNS.
2. Между точкой и контроллером проходит **UDP 5246/5247** — если между ними firewall, эти
   порты должны быть открыты.
3. На коммутаторе, куда включён WLC, разрешены VLAN всех клиентских сетей (транк).
4. На контроллере создан dynamic interface в нужной VLAN с адресом и DHCP-сервером.
5. WLAN привязан к этому интерфейсу и включён.

Диагностика «клиент не выходит в сеть» идёт по этой же лестнице снизу вверх: есть ли
ассоциация → прошла ли аутентификация → выдан ли адрес → работает ли шлюз.

## Проверка со стороны сети

```cli
SW1# show cdp neighbors
Device ID    Local Intrfce   Holdtme  Capability   Platform    Port ID
AP-2F-01     Gig 1/0/10      156         T         AIR-AP2802  Gig 0

SW1# show power inline gigabitethernet1/0/10
Interface Admin  Oper       Power   Device              Class Max
Gi1/0/10  auto   on         30.0    AIR-AP2802I-E-K9    4     30.0

SW1# show interfaces trunk        ! на порту к контроллеру
Port        Vlans allowed and active in management domain
Gi1/0/48    60,70,80
```

Три вещи, которые здесь видны: точка действительно подключена и опознана, питание выдано,
клиентские VLAN доходят до контроллера.

## Что спрашивают

- «How should the switch port connected to a lightweight AP in local mode be configured?»
  — access в VLAN точек доступа.
- «Which interface on the WLC is used by APs to build CAPWAP tunnels?» — management (на
  старых платформах — AP-manager).
- «What is the purpose of the virtual interface?» — веб-аутентификация, DHCP relay,
  мобильность; адрес не маршрутизируется.
- «Which EtherChannel mode is required for a WLC LAG?» — `on`, контроллер не согласует
  LACP/PAgP.
- «A wireless client associates but gets no IP» — проверять dynamic interface, VLAN на
  транке и DHCP.
- «Which port provides out-of-band management?» — service port.

## Проверь себя

```check
?? Точка работает в local mode. Какой режим порта коммутатора нужен?
!! Access в VLAN точек доступа: клиентские VLAN на этом порту не появляются, трафик идёт в CAPWAP.
?? Какой интерфейс WLC связывает SSID с проводной VLAN?
!! Dynamic interface.
?? В каком режиме собирают EtherChannel к контроллеру и почему?
!! В режиме on: WLC не участвует в LACP и PAgP.
?? Зачем контроллеру виртуальный интерфейс с несуществующим адресом?
!! Для веб-аутентификации, DHCP relay и поддержки мобильности — этот адрес не маршрутизируется в сеть.
?? Точка не присоединяется к контроллеру. Три первые проверки?
!! Получила ли точка IP; знает ли адрес контроллера (статика, option 43, DNS); проходят ли UDP 5246/5247 между ними.
```
