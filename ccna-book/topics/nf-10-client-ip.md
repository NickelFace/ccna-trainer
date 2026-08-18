---
id: nf-10-client-ip
dom: NF
title: IP на клиентских ОС
lead: ipconfig, ifconfig и ip — где Windows, macOS и Linux показывают адрес, маску, шлюз и DNS, и как по этому выводу поставить диагноз.
blueprint: ["1.10"]
minutes: 25
match:
  key: ["ipconfig", "ifconfig", "\\bip addr\\b", "\\ben0\\b", "nslookup"]
  re: ["ipconfig", "ifconfig", "\\bip addr\\b", "\\ben0\\b", "\\beth0\\b", "networksetup", "verify.*ip configuration", "nslookup", "DHCP enabled", "client operating system", "\\bWindows\\b", "\\bmacOS\\b", "\\bLinux\\b.*(host|command)", "workstation.*(command|configuration)", "\\bPC\\b.*ip (configuration|settings)"]
---

## Три команды на три системы

| ОС | Быстро | Подробно |
|---|---|---|
| Windows | `ipconfig` | `ipconfig /all` |
| macOS | `ifconfig` | `networksetup -getinfo Wi-Fi` |
| Linux | `ip addr` (`ifconfig` устарел) | `ip addr show` + `ip route` + `resolvectl status` |

```cli
C:\> ipconfig /all
Windows IP Configuration
   Host Name . . . . . . . . . . . . : PC-1
Ethernet adapter Ethernet0:
   Description . . . . . . . . . . . : Intel(R) 82574L
   Physical Address. . . . . . . . . : B8-76-3F-7C-57-DF
   DHCP Enabled. . . . . . . . . . . : Yes
   IPv4 Address. . . . . . . . . . . : 192.168.1.20(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Lease Obtained. . . . . . . . . . : Monday, 12:04:11
   Lease Expires . . . . . . . . . . : Tuesday, 12:04:11
   Default Gateway . . . . . . . . . : 192.168.1.1
   DHCP Server . . . . . . . . . . . : 192.168.1.254
   DNS Servers . . . . . . . . . . . : 192.168.1.254
                                       8.8.8.8
```

Что здесь достают на экзамене: **Physical Address** — это MAC; **DHCP Server** — кто выдал
адрес; **Lease** — до какого момента адрес за клиентом; **Default Gateway** — через кого
идёт всё за пределы подсети; **DNS Servers** — кто резолвит имена.

`ipconfig` без ключей покажет только адрес, маску и шлюз — MAC-адреса и DHCP-сервера там
нет. Это отдельный вопрос: «какая команда покажет MAC» → `ipconfig /all`.

## macOS и Linux

```cli
$ ifconfig en0
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
        ether 3c:22:fb:1a:2b:0c
        inet 10.10.13.100 netmask 0xffffff80 broadcast 10.10.13.127
        inet6 fe80::14e2:1a3b:5c7d:9e1f%en0 prefixlen 64
```

Маска в macOS печатается **в шестнадцатеричном виде**: `0xffffff80` = 255.255.255.128 =
**/25**. Это ровно тот вопрос, который в банке встречается с exhibit-ом `en0`: по
`0xffffff80` и адресу 10.10.13.100 подсеть — 10.10.13.0/25, broadcast 10.10.13.127.

Подсказки к переводу: `ff` = 255, `80` = 128 (/25), `c0` = 192 (/26), `e0` = 224 (/27),
`f0` = 240 (/28), `f8` = 248 (/29), `fc` = 252 (/30).

```cli
$ ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP
    link/ether 00:0c:29:3d:4e:5f brd ff:ff:ff:ff:ff:ff
    inet 172.16.5.44/24 brd 172.16.5.255 scope global dynamic eth0
$ ip route
default via 172.16.5.1 dev eth0
172.16.5.0/24 dev eth0 proto kernel scope link src 172.16.5.44
```

В Linux шлюз живёт **не** в выводе `ip addr`, а в таблице маршрутов (`ip route`, строка
`default via`). Тоже частая деталь вопроса.

## Диагностика по выводу

| Что видно | Диагноз |
|---|---|
| адрес `169.254.x.x` | DHCP не ответил — сервер, VLAN или relay |
| адрес есть, шлюза нет | выйти за пределы подсети нельзя, локально всё работает |
| шлюз из другой подсети | ошибка настройки, трафик наружу не пойдёт |
| DNS пустой или недоступен | «по IP работает, по имени нет» |
| маска отличается от соседей | узел считает часть своей подсети чужой и шлёт трафик на шлюз (или наоборот) |
| `Media disconnected` | физика: кабель, порт, драйвер |

Проверочная последовательность, которую ждут в вопросах на troubleshooting:

1. `ipconfig /all` — есть ли вообще корректный адрес.
2. `ping 127.0.0.1` — жив ли стек (доказывает только это).
3. `ping <свой адрес>` → `ping <шлюз>` — работает ли сегмент.
4. `ping 8.8.8.8` — есть ли маршрутизация наружу.
5. `ping ya.ru` / `nslookup ya.ru` — работает ли DNS.

Разделение шагов 4 и 5 — суть классического вывода: **IP проходит, имя не резолвится →
проблема в DNS**, а не в сети.

## Полезные команды рядом

```cli
C:\> ipconfig /release        :: отдать адрес
C:\> ipconfig /renew          :: запросить заново
C:\> ipconfig /flushdns       :: очистить кэш имён
C:\> arp -a                   :: соответствия IP → MAC
C:\> getmac                   :: MAC-адреса адаптеров
C:\> route print              :: таблица маршрутов узла
C:\> tracert 8.8.8.8          :: путь по хопам (Linux/macOS — traceroute)
C:\> nslookup www.cisco.com   :: проверка DNS
```

> [!key] Запомнить
> `tracert` в Windows шлёт ICMP Echo с растущим TTL, `traceroute` в Linux/macOS по
> умолчанию — UDP на высокие порты. Отсюда разное поведение через firewall: один
> проходит, другой нет.

## Разбор exhibit-задачи: полный вывод и диагноз

Вопрос даёт вывод целиком и просит найти проблему:

```cli
C:\> ipconfig /all
Ethernet adapter Ethernet0:
   Physical Address. . . . . . . . . : B8-76-3F-7C-57-DF
   DHCP Enabled. . . . . . . . . . . : No
   IPv4 Address. . . . . . . . . . . : 192.168.1.20
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.2.1
   DNS Servers . . . . . . . . . . . : 192.168.1.254
```

Читать построчно: `DHCP Enabled: No` — адрес прописан вручную, значит ошибку внёс не
сервер, а тот, кто настраивал руками. Дальше сверяем сеть: адрес `192.168.1.20/24` лежит в
сети `192.168.1.0/24`, а шлюз `192.168.2.1` — в `192.168.2.0/24`, **другой подсети**. Хост
не сможет получить MAC этого шлюза (см. главу про IPv4-адресацию — тот же принцип: шлюз
должен быть в своей подсети) — трафик наружу подсети не пойдёт вовсе, при этом всё внутри
`192.168.1.0/24` продолжит работать нормально. Диагноз ставится по одной строке
несовпадения, а не по симптому «интернета нет» — который сам по себе ничего не говорит о
причине.

## Диагностика DNS: читаем `nslookup` построчно

**Симптом.** `ping 8.8.8.8` проходит, `ping cisco.com` — «Ping request could not find host».

```cli
C:\> nslookup cisco.com
Server:  UnKnown
Address:  192.168.1.254

*** UnKnown can't find cisco.com: Server failed
```

Что здесь читают по порядку: строка `Server` / `Address` — это **DNS-сервер, к которому
обратился клиент**, не адрес сайта; `Server failed` — сервер имён ответил, но не смог
разрешить имя (в отличие от таймаута, когда сервер вообще не отвечает). Раз ICMP до
8.8.8.8 проходит — маршрутизация исправна, значит дело либо в самом DNS-сервере (не
резолвит, не проксирует наружу), либо в правильности его адреса в настройках клиента.
Меняем на заведомо рабочий публичный резолвер и проверяем повторно:

```cli
C:\> nslookup cisco.com 8.8.8.8
Server:  dns.google
Address:  8.8.8.8

Non-authoritative answer:
Name:    cisco.com
Address: 72.163.4.185
```

Успех со сторонним сервером и отказ со своим подтверждает: проблема именно во внутреннем
DNS, а не в сети и не в клиенте.

## Читаем таблицу маршрутов узла: `route print` / `ip route`

```cli
C:\> route print
IPv4 Route Table
Network Destination     Netmask       Gateway         Interface      Metric
0.0.0.0                 0.0.0.0       192.168.1.1     192.168.1.20      25
192.168.1.0        255.255.255.0     On-link        192.168.1.20     281
```

Строка `0.0.0.0` / `0.0.0.0` — это маршрут по умолчанию, тот же смысл, что `default via` в
Linux: «всё, что не подошло под более точный маршрут, идёт через этот шлюз». Строка
`192.168.1.0` с `Gateway: On-link` — это собственная подсеть узла, трафик в неё уходит
напрямую, без шлюза. Если строки default нет вовсе — узел физически не сможет отправить
ничего за пределы своей подсети. Windows-GUI при ручной настройке обычно вообще не даёт
сохранить шлюз, которого нет в собственной подсети адаптера, — предупреждает об этом сразу;
но конфигурация, заданная другим способом (скриптом, DHCP-сервером с ошибкой в области),
может проскочить эту проверку и тогда именно `route print` покажет, что маршрута по
умолчанию нет.

## Что спрашивают

- «Which command displays the MAC address on a Windows host?» — `ipconfig /all` (или
  `getmac`).
- «Refer to the exhibit… which subnet is configured on the en0 interface?» — перевести
  hex-маску и посчитать блок.
- «A host has an APIPA address. What is the problem?» — недоступен DHCP.
- «Ping to IP works, ping to name fails. What is wrong?» — DNS.
- «Where does a Linux host show its default gateway?» — в таблице маршрутизации
  (`ip route`, строка default).
- «A statically configured host has an address and gateway in different subnets. What is
  the effect?» — трафик внутри своей подсети работает, наружу — нет, потому что MAC такого
  шлюза узел получить не сможет.
- «An `nslookup` query returns "Server failed" from the internal DNS server, but a query to
  a public resolver succeeds. Where is the problem?» — во внутреннем DNS-сервере, не в
  сети и не в клиенте.
- «Which line in `route print` or `ip route` represents the default route?» — `0.0.0.0
  0.0.0.0` в Windows, `default via ...` в Linux.

## Проверь себя

```check
?? macOS показывает netmask 0xffffffc0. Какой это префикс?
!! c0 = 192 → 255.255.255.192 → /26.
?? Какая команда Windows покажет, какой сервер выдал адрес по DHCP?
!! ipconfig /all — строка DHCP Server.
?? Ping до 8.8.8.8 идёт, ping до google.com — нет. Что чинишь?
!! DNS: адрес сервера имён, доступность, кэш (ipconfig /flushdns).
?? Где в Linux искать шлюз по умолчанию?
!! В ip route — строка «default via …», в выводе ip addr его нет.
?? Клиент получил 169.254.12.9 и видит только соседей с такими же адресами. Почему?
!! Это APIPA: DHCP не ответил, узлы общаются только внутри канала и без шлюза.
?? DHCP Enabled: No, адрес 192.168.1.20/24, шлюз 192.168.2.1. Что не так и что при этом продолжит работать?
!! Шлюз в другой подсети (192.168.2.0/24 вместо 192.168.1.0/24) — узел не получит его MAC, трафик наружу не пойдёт; связь внутри 192.168.1.0/24 при этом сохранится.
?? nslookup к своему DNS-серверу возвращает Server failed, к 8.8.8.8 — успешный ответ. Где искать проблему?
!! Во внутреннем DNS-сервере: сеть и клиент в порядке, раз сторонний резолвер отвечает нормально.
?? В route print нет строки 0.0.0.0/0.0.0.0. Что это значит для узла?
!! Нет маршрута по умолчанию — узел не сможет отправить трафик за пределы своей подсети, даже если шлюз указан в ipconfig.
```
