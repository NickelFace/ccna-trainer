---
id: ipc-05-eigrp-bgp
dom: IPC
title: EIGRP и BGP в объёме экзамена
lead: Чем EIGRP отличается от OSPF, что такое feasible successor, зачем нужен eBGP и как читаются их выводы.
blueprint: ["3.0"]
minutes: 35
match:
  key: ["\\bEIGRP\\b", "\\bBGP\\b", "feasible (successor|distance)", "autonomous system.*(eigrp|bgp)", "\\bDUAL\\b", "\\bAS.?path\\b"]
  re: ["eigrp", "\\bbgp\\b", "successor", "neighbor.*remote-as", "\\bIGP\\b vs \\bEGP\\b", "hold time.*eigrp", "variance", "peering"]
---

## Где эти протоколы в картине мира

| | OSPF | EIGRP | BGP |
|---|---|---|---|
| Тип | link-state | advanced distance-vector | path-vector |
| Область | внутри AS (IGP) | внутри AS (IGP) | между AS (EGP) |
| Стандарт | открытый | Cisco (открыт в 2013) | открытый |
| AD | 110 | 90 внутр. / 170 внеш. | 20 eBGP / 200 iBGP |
| Метрика | cost по полосе | полоса + задержка | атрибуты пути |
| Транспорт | IP 89 | IP 88 | **TCP 179** |
| Multicast | 224.0.0.5/6 | 224.0.0.10 | нет, unicast-сессия |

Смысл разделения: **IGP** отвечает за оптимальный путь внутри своей сети, **BGP** — за
политику обмена маршрутами между организациями и провайдерами.

## EIGRP: что нужно знать

```cfg
router eigrp 100                  ! номер AS обязан совпадать у соседей
 no auto-summary
 network 10.1.1.0 0.0.0.255
 network 192.168.1.0
!
interface GigabitEthernet0/1
 ip hello-interval eigrp 100 5
```

- **Номер AS должен совпадать** — в отличие от process ID у OSPF. Это первое отличие,
  которое спрашивают.
- Соседство держится на hello: по умолчанию **5/15 секунд** на быстрых каналах.
- Алгоритм **DUAL** хранит не только лучший маршрут (**successor**), но и заранее
  просчитанный запасной (**feasible successor**) — поэтому переключение мгновенное, без
  пересчёта.
- Условие запасного (feasibility condition): **reported distance соседа меньше, чем
  собственная feasible distance** — иначе маршрут мог бы оказаться петлёй.
- Метрика по умолчанию считается по **полосе и задержке**; надёжность и загрузка входят в
  формулу, но их веса нулевые.
- Единственный IGP с **unequal-cost** балансировкой (`variance`).

```cli
R1# show ip eigrp neighbors
H   Address       Interface   Hold Uptime   SRTT  RTO   Q  Seq
0   10.1.1.2      Gi0/1        13  00:22:41   12   100  0  14

R1# show ip eigrp topology
P 192.168.9.0/24, 1 successors, FD is 3072
        via 10.1.1.2 (3072/2816), GigabitEthernet0/1
        via 10.1.1.6 (5120/2816), GigabitEthernet0/2
```

`P` — passive, то есть маршрут стабилен. Состояние `A` (active) означает, что роутер
ищет путь заново — постоянные active-состояния это симптом нестабильности («stuck in
active»).

## BGP: минимум, который спрашивают

```cfg
router bgp 65001
 neighbor 203.0.113.1 remote-as 65002      ! eBGP: разные AS
 network 198.51.100.0 mask 255.255.255.0
```

- Работает поверх **TCP 179** — значит соседей задают вручную, multicast-обнаружения нет,
  и между ними должна быть IP-связность.
- **eBGP** — между разными AS (AD 20), **iBGP** — внутри одной (AD 200).
- Основной атрибут выбора пути на уровне CCNA — **AS-path**: чем короче список
  автономных систем, тем лучше маршрут.
- `network` в BGP не включает протокол на интерфейсе (как в IGP), а **объявляет уже
  существующий в таблице префикс**.

```cli
R1# show ip bgp summary
Neighbor      V   AS   MsgRcvd MsgSent  Up/Down  State/PfxRcd
203.0.113.1   4  65002    1204    1198  20:14:02      312

R1# show ip bgp
   Network          Next Hop        Metric LocPrf Weight Path
*> 10.0.0.0/8       203.0.113.1                        0 65002 65010 i
```

В колонке `State/PfxRcd` число означает, что сессия установлена и принято столько
префиксов; текст (`Idle`, `Active`) — что сессия не поднялась.

Где BGP встречается на практике уровня CCNA: подключение организации к **двум
провайдерам**, обмен маршрутами с провайдером, приём маршрута по умолчанию.

## Сравнение для быстрых ответов

- Нужен открытый стандарт и предсказуемая сходимость внутри сети → **OSPF**.
- Только оборудование Cisco, нужна мгновенная сходимость и простая настройка → **EIGRP**.
- Нужно обмениваться маршрутами с чужой организацией по политике → **BGP**.
- Нужна балансировка по неравным путям → **EIGRP**.
- Требуется масштабирование зонами и иерархия → **OSPF**.

## Что спрашивают

- «Which value must match between EIGRP neighbors?» — номер автономной системы.
- «What is a feasible successor?» — заранее проверенный запасной маршрут, удовлетворяющий
  условию feasibility.
- «Which protocol uses TCP port 179?» — BGP.
- «What is the administrative distance of eBGP / internal EIGRP?» — 20 / 90.
- «Which two metrics does EIGRP use by default?» — полоса и задержка.
- «Which routing protocol is used between autonomous systems?» — BGP.
- Вывод `show ip eigrp topology` с вопросом «какой маршрут successor».

## Проверь себя

```check
?? Чем номер AS в EIGRP отличается от process ID в OSPF?
!! Номер AS должен совпадать у соседей, process ID OSPF локален.
?? Что означает состояние P в show ip eigrp topology?
!! Passive — маршрут стабилен; A (active) означает, что идёт перерасчёт.
?? На каком транспорте и порту работает BGP?
!! TCP, порт 179; соседи задаются вручную.
?? Какая AD у eBGP и почему она такая низкая?
!! 20 — ниже, чем у любого IGP: маршрутам от внешнего партнёра доверяют больше, чем внутренним пересчётам при выходе наружу.
?? Что даёт EIGRP команда variance?
!! Балансировку по путям с разной метрикой (unequal-cost), чего нет у остальных IGP.
```
