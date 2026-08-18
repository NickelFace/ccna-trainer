---
id: na-06-stp
dom: NA
title: Spanning Tree и Rapid PVST+
lead: Как выбирается корень, порты и их роли, чем Rapid PVST+ быстрее классического STP и зачем PortFast, BPDU guard и root guard.
blueprint: ["2.5"]
minutes: 50
match:
  key: ["spanning.?tree", "\\bBPDU\\b", "root bridge", "root port", "portfast", "rapid pvst"]
  re: ["spanning.?tree", "\\bSTP\\b", "\\bRSTP\\b", "rapid pvst", "\\bBPDU\\b", "root bridge", "root port", "designated port", "\\bblocking\\b", "portfast", "bpduguard", "bpdu guard", "root guard", "loop guard", "bridge (id|priority)", "\\bTCN\\b", "path cost", "alternate port"]
---

## Задача, которую решает STP

Резервные линки между коммутаторами обязательны — и они же создают петлю на втором уровне.
Петля в L2 катастрофична: у кадра нет TTL, широковещательный шторм за секунды съедает
процессор, MAC-таблица «дребезжит» между портами.

**STP строит из физической сетки логическое дерево без петель**, переводя лишние порты в
блокировку и включая их обратно, когда основной путь падает.

## Кто становится корнем

Выбор идёт по **Bridge ID** = приоритет (2 байта) + MAC-адрес коммутатора. Меньше значение
— лучше.

- Приоритет по умолчанию — **32768**, задаётся кратно 4096.
- В Rapid PVST+ к приоритету прибавляется номер VLAN (**extended system ID**), поэтому в
  выводе видно 32778 для VLAN 10.
- При равных приоритетах побеждает **меньший MAC**. Отсюда классика: без настройки корнем
  становится самый старый коммутатор в сети — обычно самый слабый.

```cfg
Switch(config)# spanning-tree vlan 10 root primary      ! приоритет 24576
Switch(config)# spanning-tree vlan 10 root secondary    ! приоритет 28672
Switch(config)# spanning-tree vlan 10 priority 4096     ! вручную
```

> [!key] Запомнить
> Корень должен стоять там, где сходится трафик — на distribution/core, а не «где
> получилось». Задать это явно — обязательная часть любого правильного дизайна.

## Роли портов

| Роль | Кто это | Состояние |
|---|---|---|
| **Root port** | лучший путь **к корню**, по одному на некорневой коммутатор | forwarding |
| **Designated port** | лучший порт в сегменте; на корне designated **все** порты | forwarding |
| **Non-designated / alternate** | проигравший порт | blocking (в RSTP — discarding) |
| **Backup** (только RSTP) | резерв к тому же сегменту | discarding |

Выбор идёт по цепочке критериев, и её спрашивают в задачах «какой порт заблокируется»:

1. Наименьшая **стоимость пути до корня** (root path cost).
2. Наименьший **Bridge ID соседа** (кто по пути ближе к корню).
3. Наименьший **port priority** соседа.
4. Наименьший **номер порта** соседа.

Стоимости по скорости (стандарт IEEE, современный вариант):

| Скорость | Cost |
|---|---:|
| 10 Мбит/с | 100 |
| 100 Мбит/с | 19 |
| 1 Гбит/с | 4 |
| 10 Гбит/с | 2 |

Стоимость пути суммируется по линкам к корню. Два пути 100 Мбит/с (19+19=38) хуже одного
гигабитного (4).

## Состояния и таймеры

Классический 802.1D:

| Состояние | Что делает | Длительность |
|---|---|---|
| Blocking | слушает BPDU, не пересылает | 20 с (max age) при сбое |
| Listening | участвует в выборах, не учит MAC | 15 с (forward delay) |
| Learning | учит MAC, не пересылает | 15 с |
| Forwarding | работает | — |

Итого до 30–50 секунд на переход — вечность для пользователя. **Rapid PVST+ (802.1w)**
сокращает это до секунд за счёт:

- всего трёх состояний: **discarding, learning, forwarding**;
- механизма **proposal/agreement** — соседи договариваются напрямую вместо ожидания
  таймеров;
- **edge-портов** (это и есть PortFast) — они включаются сразу;
- BPDU шлёт каждый коммутатор сам, а не только корень; пропажа трёх подряд (6 секунд)
  считается отказом линка.

Cisco по умолчанию использует **PVST+** — отдельное дерево на каждую VLAN, что позволяет
балансировать: VLAN 10 корнем на SW1, VLAN 20 — на SW2, оба линка работают.

```cfg
Switch(config)# spanning-tree mode rapid-pvst
```

## Защитные механизмы

| Механизм | Где включают | Что делает |
|---|---|---|
| **PortFast** | порты к конечным устройствам | сразу forwarding, без 30 секунд ожидания |
| **BPDU guard** | там же | получил BPDU → порт в `err-disabled` |
| **BPDU filter** | там же (осторожно) | не шлёт и игнорирует BPDU |
| **Root guard** | порты вниз, к соседям | сосед объявил себя лучшим корнем → порт в `root-inconsistent` |
| **Loop guard** | root/alternate порты | пропали BPDU → порт не открывается, а уходит в `loop-inconsistent` |

```cfg
interface range gigabitethernet0/1 - 20
 spanning-tree portfast
 spanning-tree bpduguard enable
!
! или глобально для всех access-портов
spanning-tree portfast default
spanning-tree portfast bpduguard default
```

Смысл связки PortFast + BPDU guard: порт к пользователю включается мгновенно, но если в
него воткнут коммутатор (или петлю), порт немедленно гасится, а не разрушает дерево.

Восстановление после `err-disabled` — вручную (`shutdown` / `no shutdown`) или
автоматически:

```cfg
errdisable recovery cause bpduguard
errdisable recovery interval 300
```

## Чтение вывода

```cli
SW2# show spanning-tree vlan 10

VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     aabb.cc00.0100
             Cost        4
             Port        1 (GigabitEthernet0/1)

  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     aabb.cc00.0200

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- --------
Gi0/1            Root FWD 4         128.1    P2p
Gi0/2            Altn BLK 4         128.2    P2p
Gi0/5            Desg FWD 19        128.5    P2p Edge
```

Как читать: блок **Root ID** — про корень (если его адрес совпадает с Bridge ID, этот
коммутатор и есть корень); **Cost 4** — стоимость до корня; `Root FWD` — порт к корню;
`Altn BLK` — заблокированный резерв; `Edge` — PortFast.

## Изменения топологии

При падении линка коммутатор шлёт **TCN**, дерево пересчитывается, а MAC-таблицы
ускоренно стареют (15 секунд вместо 300) — иначе кадры уходили бы в порт, за которым
устройства больше нет. Постоянно «мигающий» порт вызывает шквал TCN — ещё одна причина
ставить PortFast на пользовательские порты (edge-порт TCN не генерирует).

## Что спрашивают

- «Which switch becomes the root bridge?» — наименьший приоритет, при равенстве —
  наименьший MAC.
- «Which port will be blocked?» — по цепочке: стоимость пути, Bridge ID соседа, priority,
  номер порта.
- «What is the cost of a 1 Gbps link?» — 4.
- «What does PortFast do and where is it safe?» — мгновенный переход в forwarding на
  портах к конечным устройствам.
- «A port went err-disabled after a switch was connected. Why?» — сработал BPDU guard.
- «Which feature prevents an inferior switch from becoming root?» — root guard.
- «How many root ports does a non-root switch have?» — ровно один на VLAN.

## Проверь себя

```check
?? Два коммутатора с одинаковым приоритетом 32768. Кто станет корнем?
!! Тот, у кого меньше MAC-адрес в Bridge ID.
?? Почему в выводе приоритет 32778, а не 32768?
!! К приоритету прибавлен номер VLAN (extended system ID): 32768 + 10.
?? Сколько root-портов у некорневого коммутатора и сколько у корневого?
!! У некорневого один; у корневого их нет вовсе — все его порты designated.
?? Порт ушёл в err-disabled сразу после подключения нового устройства. Что случилось?
!! Устройство прислало BPDU, а на порту включён BPDU guard.
?? Чем root guard отличается от BPDU guard?
!! BPDU guard гасит порт при любом BPDU; root guard блокирует порт, только если сосед претендует на роль корня.
?? Сколько времени занимает переход порта в forwarding в классическом STP и почему RSTP быстрее?
!! 30–50 секунд по таймерам listening/learning; RSTP договаривается напрямую (proposal/agreement) и укладывается в секунды.
```
