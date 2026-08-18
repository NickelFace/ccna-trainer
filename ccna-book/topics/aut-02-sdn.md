---
id: aut-02-sdn
dom: AUT
title: SDN, плоскости и фабрика
lead: Control plane и data plane, северный и южный API, underlay и overlay, что делает Catalyst Center и как устроены SD-Access и SD-WAN.
blueprint: ["6.3"]
minutes: 35
fallback: true
match:
  key: ["\\bSDN\\b", "control plane", "data plane", "northbound", "southbound", "underlay", "overlay", "\\bfabric\\b", "SD-?Access", "SD-?WAN", "DNA Center|Catalyst Center", "\\bVXLAN\\b", "\\bLISP\\b"]
  re: ["software-defined", "centralized control", "management plane", "network controller", "\\bAPIC\\b", "campus fabric"]
---

## Три плоскости

| Плоскость | Что делает | Примеры |
|---|---|---|
| **Data (forwarding) plane** | пересылает пакеты по уже готовым таблицам | ASIC коммутатора, FIB |
| **Control plane** | строит эти таблицы | OSPF, EIGRP, BGP, STP, ARP |
| **Management plane** | доступ к устройству и наблюдение | SSH, SNMP, syslog, NetFlow |

Идея SDN в одной фразе: **вынести control plane с устройств на контроллер**. Устройства
остаются быстрыми исполнителями, а решения принимаются централизованно, с полной картиной
сети.

## Северный и южный API

```txt
      приложения, скрипты, портал
                 ▲
         northbound API (REST)
                 │
          [  контроллер  ]
                 │
      southbound API (NETCONF, RESTCONF,
        OpenFlow, gRPC, Telnet/SSH)
                 ▼
        коммутаторы и роутеры
```

- **Northbound** — «наверх», к приложениям и людям. Обычно **REST API**: им пользуются
  скрипты, системы оркестрации, порталы самообслуживания.
- **Southbound** — «вниз», к устройствам: **NETCONF** (XML поверх SSH), **RESTCONF**
  (HTTP+JSON), **OpenFlow**, **gRPC/gNMI**, а в переходных решениях — обычные SSH-команды.

Направление легко запомнить по картинке: приложения сверху, железо снизу.

## Underlay и overlay

- **Underlay** — физическая сеть: коммутаторы, кабели, IP-адреса на линках и IGP, который
  обеспечивает связность между устройствами. Задача одна — чтобы любой узел мог достучаться
  до любого.
- **Overlay** — логическая сеть поверх него: туннели (**VXLAN**, GRE, IPsec), в которых
  живёт пользовательский трафик. Он не знает о физической топологии.
- **Fabric** — underlay и overlay вместе, управляемые как единое целое с общей политикой.

Преимущество разделения: политика («кто с кем может общаться») перестаёт зависеть от того,
куда воткнут кабель.

## SD-Access

Фабрика для кампуса, управляемая **Catalyst Center** (прежнее имя — DNA Center):

- **Control plane** — LISP: отдельная база «кто где находится» вместо флудинга.
- **Data plane** — VXLAN: пользовательский трафик инкапсулируется между fabric-узлами.
- **Политика** — SGT (Security Group Tags) через **TrustSec**: правила пишутся в терминах
  групп («гости», «медицина»), а не адресов и VLAN.
- Роли узлов: **edge** (к пользователям), **border** (выход из фабрики), **control plane
  node** (база соответствий).

Что это даёт на практике: сотрудник подключается где угодно и получает свою политику;
макросегментация делается VN (виртуальными сетями), микросегментация — тегами SGT.

## SD-WAN

То же разделение, но для филиалов через любые каналы (интернет, LTE, MPLS):

- **vManage** — управление и настройка;
- **vSmart** — контрольная плоскость, раздаёт политики и маршруты;
- **vBond** — знакомит устройства друг с другом при подключении;
- **vEdge/cEdge** — сами маршрутизаторы на площадках.

Ценность: **выбор канала по приложению** (голос в MPLS, резервные копии в интернет),
шифрование по умолчанию, единая политика на все филиалы, быстрое подключение новой
площадки (zero-touch provisioning).

## Что умеет контроллер кампуса

- инвентаризация: какие устройства есть, версии ПО, топология;
- шаблоны конфигураций и массовое применение;
- **assurance** — оценка «здоровья» клиентов и сети, поиск причин проблем;
- обновление ПО по расписанию;
- **северный REST API** — всё то же самое доступно скрипту.

## Что спрашивают

- «Which plane forwards packets?» — data plane.
- «Which API type is used by applications to talk to a controller?» — northbound (REST).
- «Which protocols are southbound?» — NETCONF, RESTCONF, OpenFlow, gRPC.
- «What is the difference between underlay and overlay?» — физическая сеть против
  логической поверх неё.
- «Which technology encapsulates user traffic in SD-Access?» — VXLAN (control plane —
  LISP).
- «What is a benefit of controller-based networking?» — единая политика, полная видимость,
  быстрое развёртывание.

## Проверь себя

```check
?? Куда SDN переносит control plane и что остаётся на устройстве?
!! На контроллер; устройство сохраняет data plane и продолжает пересылать пакеты.
?? Скрипт запрашивает у контроллера список устройств. Какой это API?
!! Northbound, обычно REST.
?? Чем underlay отличается от overlay?
!! Underlay — физическая сеть и IGP между устройствами; overlay — туннели с пользовательским трафиком поверх неё.
?? Какие два протокола образуют основу SD-Access?
!! LISP в контрольной плоскости и VXLAN в плоскости данных.
?? Зачем в SD-WAN отдельный компонент vBond?
!! Он «знакомит» устройства с контроллерами при первом подключении и помогает пройти NAT.
```
