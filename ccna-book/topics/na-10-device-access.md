---
id: na-10-device-access
dom: NA
title: Доступ к управлению устройством
lead: Консоль, Telnet, SSH, HTTP(S), out-of-band и in-band, линии vty и aux, и почему Telnet больше не вариант.
blueprint: ["2.8"]
minutes: 30
fallback: true
match:
  key: ["line vty", "\\btelnet\\b", "out-?of-?band", "console (port|access|line)", "transport input"]
  re: ["console (port|access|line)", "\\bvty\\b", "line vty", "\\btelnet\\b", "\\bSSH\\b.*(access|management)", "in-?band", "out-?of-?band", "management access", "\\bAUX\\b", "transport input", "terminal monitor", "remote access to.*device"]
---

## Два способа добраться до устройства

- **Out-of-band** — доступ, не зависящий от работоспособности сети: консольный порт, AUX
  с модемом, service port контроллера, терминальный сервер. Работает, даже когда
  конфигурация сломана и IP-связности нет.
- **In-band** — доступ по самой сети: SSH, Telnet, HTTPS, SNMP. Удобно, но если сеть
  легла, сюда не попасть.

Отсюда правило, которое проверяют: **первичная настройка и восстановление — только через
консоль**; повседневная работа — по SSH.

## Консоль

Кабель rollover (RJ-45 или USB), параметры терминала: **9600 бод, 8 бит данных, без
контроля чётности, 1 стоп-бит, без управления потоком** (8-N-1). Их спрашивают набором.

```cfg
line console 0
 password cisco
 login
 exec-timeout 5 0
 logging synchronous
```

`logging synchronous` — чтобы сообщения журнала не рвали набираемую строку;
`exec-timeout 5 0` — выкидывать бездействующую сессию через 5 минут.

## Telnet и SSH

| | Telnet | SSH |
|---|---|---|
| Порт | TCP 23 | TCP 22 |
| Шифрование | **нет**, пароль летит открытым текстом | да |
| Аутентификация | пароль линии или локальный пользователь | обязательно имя пользователя |
| Где допустим | лаборатория | везде |

Настройка SSH — последовательность, которую любят разбирать по шагам:

```cfg
hostname SW1                                   ! 1. имя
ip domain-name example.com                     ! 2. домен — из hostname+domain строится имя ключа
crypto key generate rsa modulus 2048           ! 3. ключи (минимум 768, практически 2048)
ip ssh version 2                               ! 4. только вторая версия
username admin privilege 15 secret S3cret!     ! 5. локальный пользователь
!
line vty 0 15
 transport input ssh                           ! 6. никакого Telnet
 login local                                   ! 7. проверять по локальной базе
 exec-timeout 10 0
```

Без пунктов 1–2 команда генерации ключей не отработает: устройству нужно полное доменное
имя. `transport input ssh` — то самое место, где закрывают Telnet; вариант
`transport input all` в вопросах на безопасность всегда неверный.

## Линии vty

`line vty 0 15` — шестнадцать одновременных сессий удалённого доступа. Что с ними делают:

- ограничивают доступ ACL: `access-class 10 in` — заходить можно только с адресов
  управления;
- задают тайм-аут бездействия;
- включают `login local` (учётки) вместо общего пароля линии.

```cli
SW1# show users
    Line       User       Host(s)              Idle       Location
   0 con 0                idle                 00:00:00
*  2 vty 0     admin      idle                 00:00:00   10.0.99.55

SW1# show ssh
Connection Version Mode Encryption  Hmac   State         Username
0          2.0     IN   aes256-ctr  sha1   Session started  admin
```

## Веб-доступ и облако

- **HTTP (80)** — открытый текст, выключают: `no ip http server`.
- **HTTPS (443)** — оставляют, если нужен веб-интерфейс: `ip http secure-server`.
- **Cloud-managed** (Meraki, Catalyst Center/DNA Center) — устройство само поднимает
  туннель к облаку, администратор работает через портал. Плюс: не нужен доступ снаружи
  внутрь. Минус: зависимость от связи с облаком.

## Что нужно, чтобы удалённый доступ вообще был

1. У устройства есть IP: у роутера — на интерфейсе, у L2-коммутатора — на **SVI**.
2. Задан шлюз по умолчанию (`ip default-gateway` для L2-коммутатора).
3. Порт/VLAN управления активны.
4. Настроены аутентификация и `transport input`.
5. Пароль на привилегированный режим: `enable secret` (хешируется), не `enable password`.

Типовая цепочка отказов в вопросах: пингуется, но SSH не пускает → нет пользователя или
`login local`; не пингуется вовсе → SVI/шлюз/VLAN.

> [!trap] Ловушка
> `service password-encryption` шифрует пароли в конфиге **слабым** обратимым алгоритмом
> (тип 7) — это защита от взгляда через плечо, а не от атакующего. Настоящая защита —
> `enable secret` и `username … secret` (хеш).

## Что спрашивают

- «Which method provides out-of-band access?» — консоль (или service port / AUX-модем).
- «Which commands are required to enable SSH?» — hostname, ip domain-name, crypto key
  generate rsa, username, transport input ssh, login local.
- «Why is Telnet not recommended?» — данные и пароли передаются открытым текстом.
- «What restricts which addresses may open a vty session?» — `access-class` на линии vty.
- «What is the default console speed?» — 9600 бод, 8-N-1.
- «Which command hashes the privileged-mode password?» — `enable secret`.

## Проверь себя

```check
?? Конфигурация сломана, IP нет вовсе. Как попасть на устройство?
!! Через консольный порт — out-of-band доступ не зависит от сети.
?? Каких двух команд не хватит для генерации ключей SSH, если их не задать заранее?
!! hostname и ip domain-name — из них строится имя ключа.
?? Как разрешить SSH и одновременно запретить Telnet на линиях vty?
!! transport input ssh.
?? Чем enable secret лучше enable password?
!! Он хранится в виде хеша, а password — в открытом виде (или под обратимым шифрованием типа 7).
?? Устройство пингуется, но SSH не пускает. Две вероятные причины?
!! Нет локального пользователя или не задан login local; либо на vty стоит transport input, не включающий ssh.
```
