---
id: sec-05-aaa
dom: SEC
title: AAA, RADIUS, TACACS+ и 802.1X
lead: Три «A» по отдельности, чем TACACS+ отличается от RADIUS, как устроена аутентификация порта по 802.1X.
blueprint: ["5.5"]
minutes: 30
match:
  key: ["\\bAAA\\b", "\\bRADIUS\\b", "\\bTACACS\\+?\\b", "802\\.1X", "authentication.*authorization.*accounting", "supplicant", "authenticator", "distinguish.*authentication.*(author|accounting)", "authentication.*(differ|distinguish).*(author|accounting)"]
  re: ["aaa new-model", "authentication server", "identity.*network access", "\\bEAP\\b", "accounting record", "centralized authentication", "distinguish.*authentication", "authentication.*(differ|distinguish)", "logs? ?in.*username and password", "management security process"]
---

## Три «A»

| | Вопрос | Пример |
|---|---|---|
| **Authentication** | Кто ты? | логин и пароль, сертификат, токен |
| **Authorization** | Что тебе можно? | уровень привилегий, набор разрешённых команд, VLAN |
| **Accounting** | Что ты сделал? | журнал команд, время сессии, объём трафика |

Разделение спрашивают напрямую: «пользователь вошёл» — authentication; «ему разрешили
только show-команды» — authorization; «в журнале сохранена каждая введённая команда» —
accounting.

## RADIUS и TACACS+

| | RADIUS | TACACS+ |
|---|---|---|
| Стандарт | открытый (RFC) | Cisco |
| Транспорт | **UDP** 1812/1813 (или 1645/1646) | **TCP 49** |
| Что шифруется | только пароль | **весь пакет** |
| Разделение A-A-A | authentication и authorization **объединены** | все три **раздельно** |
| Типичное применение | доступ пользователей в сеть: 802.1X, Wi-Fi, VPN | администрирование устройств: кто какие команды может вводить |

Мнемоника выбора: **сеть для пользователей → RADIUS; управление оборудованием →
TACACS+** (там нужна авторизация покомандно, а её RADIUS не умеет).

```cfg
aaa new-model
!
radius server ISE
 address ipv4 10.0.0.80 auth-port 1812 acct-port 1813
 key R@diusKey
!
tacacs server TAC1
 address ipv4 10.0.0.81
 key T@cacsKey
!
aaa authentication login default group tacacs+ local
aaa authorization exec default group tacacs+ local
aaa accounting commands 15 default start-stop group tacacs+
```

> [!key] Запомнить
> Ключевое слово **`local` в конце** — резервный способ входа, если сервер недоступен. Без
> него отказ AAA-сервера означает, что в устройство не войдёт никто, включая
> администратора.

## 802.1X: аутентификация порта

Порт не пропускает трафик, пока устройство не докажет, кто оно.

Три роли:

- **Supplicant** — клиент (ОС компьютера, телефон);
- **Authenticator** — коммутатор или точка доступа, посредник;
- **Authentication server** — RADIUS (обычно Cisco ISE).

Обмен: клиент и сервер говорят по **EAP**, коммутатор упаковывает EAP в RADIUS. До
успешной аутентификации через порт проходит **только EAPOL**.

```cfg
aaa authentication dot1x default group radius
dot1x system-auth-control
!
interface GigabitEthernet1/0/5
 switchport mode access
 authentication port-control auto
 dot1x pae authenticator
```

Что даёт, кроме допуска: сервер может вернуть **динамическую VLAN**, ACL или профиль QoS —
устройство попадает именно в ту сеть, которая ему положена. Для устройств без supplicant
(принтеры, камеры) применяют **MAB** (MAC Authentication Bypass) или гостевую VLAN.

## Где это встречается на практике уровня CCNA

- Wi-Fi **WPA2/WPA3-Enterprise** — тот же 802.1X, только по радио; на WLC во вкладке
  Security → AAA Servers выбирают RADIUS.
- Вход администраторов на коммутаторы и роутеры — TACACS+ с покомандной авторизацией.
- VPN-доступ — RADIUS с MFA.

## Разбор: полный обмен 802.1X от подключения кабеля до доступа в сеть

```txt
1. Клиент подключает кабель. Порт в состоянии unauthorized — пропускает только EAPOL.
2. Supplicant → Authenticator: EAPOL-Start (клиент сообщает о готовности аутентифицироваться)
3. Authenticator → Supplicant: EAP-Request Identity
4. Supplicant → Authenticator: EAP-Response Identity (например, имя пользователя)
5. Authenticator упаковывает EAP в RADIUS Access-Request → Authentication Server
6. Authentication Server и Supplicant обмениваются EAP внутри RADIUS
   (метод зависит от EAP-типа: EAP-TLS — сертификаты, PEAP — логин/пароль внутри TLS-туннеля)
7. Authentication Server → Authenticator: RADIUS Access-Accept
   (может нести VLAN assignment, ACL, время сессии — RADIUS-атрибуты)
8. Authenticator переводит порт в authorized — обычный трафик пошёл
```

Ключевая деталь для понимания архитектуры: **authenticator (коммутатор) сам не проверяет
пароль и не хранит учётные записи** — он только ретранслирует EAP-сообщения между
supplicant и authentication server, упаковывая их в RADIUS. Вся логика проверки — на
сервере. Это объясняет, почему замена метода аутентификации (PEAP на EAP-TLS,
например) требует изменений на клиенте и сервере, но не на самом коммутаторе — он видит
одни и те же EAP-кадры независимо от их содержимого.

## Диагностика: 802.1X пускает не в ту VLAN

**Симптом.** Устройство успешно проходит 802.1X-аутентификацию (порт переходит в
authorized), но оказывается не в ожидаемой корпоративной VLAN, а в VLAN по умолчанию для
порта.

**Что смотрим.** Возвращает ли RADIUS-сервер атрибуты назначения VLAN в Access-Accept, и
принимает ли их коммутатор:

```cli
SW1# show authentication sessions interface gi1/0/5
            Interface:  GigabitEthernet1/0/5
                 Status:  Authz Success
                    Vlan:  1
```

**Что нашли.** Аутентификация прошла успешно (`Authz Success`), но VLAN осталась
дефолтной — значит, либо RADIUS-сервер не настроен отправлять RADIUS-атрибуты
`Tunnel-Type`/`Tunnel-Medium-Type`/`Tunnel-Private-Group-ID` (именно они несут номер
динамической VLAN в Access-Accept), либо коммутатор их получил, но не смог применить
(например, VLAN с таким номером не существует на этом коммутаторе). Это разделяет
причину на две стороны: сначала проверяют политику на самом RADIUS-сервере (профиль
авторизации для этого пользователя/устройства), потом — существование и активность нужной
VLAN на коммутаторе, точно так же, как в главе про VLAN.

## Диагностика: администратор не может войти, потому что TACACS+ сервер недоступен

**Симптом.** Основной TACACS+-сервер упал (плановые работы или сбой), и ни один
администратор не может зайти на коммутаторы — даже те, кто раньше заходил без проблем.

**Что смотрим.** Полную строку `aaa authentication login`, а не только факт, что TACACS+
настроен:

```cli
SW1# show running-config | include aaa authentication login
aaa authentication login default group tacacs+
```

**Что нашли.** В списке методов **нет `local`** в конце — при недоступности группы
`tacacs+` аутентификация просто проваливается целиком, резервного метода не существует.
Это ровно та ловушка, о которой предупреждает врезка выше: `group tacacs+ local`
означало бы «сначала TACACS+, а если сервер недоступен — локальная база», а голый `group
tacacs+` не оставляет пути назад ни для кого, включая администратора с консольным
доступом. Исправление — добавить резервный метод, но сделать это можно только имея хотя
бы один рабочий способ входа (например, через ROMMON, если совсем никак).

## Что спрашивают

- «Which protocol separates authentication and authorization?» — TACACS+.
- «Which protocol encrypts the entire packet?» — TACACS+ (RADIUS шифрует только пароль).
- «Which transport and port does TACACS+ use?» — TCP 49.
- «What is the role of the supplicant/authenticator/authentication server?» — клиент,
  коммутатор, RADIUS.
- «Which AAA element records what a user did?» — accounting.
- «What happens if the AAA server is unreachable and no local fallback is configured?» —
  вход становится невозможен.
- «Does the switch itself validate the user's password during 802.1X?» — нет, коммутатор
  только упаковывает EAP в RADIUS и ретранслирует между supplicant и сервером; проверка
  — целиком на authentication server.
- «A device passes 802.1X authentication but ends up in the default VLAN instead of the
  expected one. What should be checked?» — отправляет ли RADIUS-сервер атрибуты
  Tunnel-Type/Tunnel-Private-Group-ID в Access-Accept, и существует ли указанная VLAN на
  коммутаторе.
- «Administrators cannot log in to switches after the TACACS+ server goes down. What is
  misconfigured?» — в `aaa authentication login` не указан резервный метод `local`.

## Проверь себя

```check
?? Нужно ограничить набор команд, доступных инженеру поддержки на коммутаторах. Какой протокол?
!! TACACS+ — он умеет покомандную авторизацию и разделяет три «A».
?? Что происходит на порту 802.1X до успешной аутентификации?
!! Проходят только кадры EAPOL; остальной трафик блокируется.
?? Какой транспорт у RADIUS и что именно он шифрует?
!! UDP; шифруется только пароль, остальной пакет открыт.
?? Как подключить к сети принтер, у которого нет supplicant?
!! Через MAB — аутентификацию по MAC-адресу, либо поместить порт в гостевую VLAN.
?? Зачем в команде aaa authentication login указывать local последним?
!! Это резерв: при недоступности сервера можно войти по локальной учётной записи.
?? Проверяет ли коммутатор сам пароль пользователя при 802.1X?
!! Нет — он только ретранслирует EAP-сообщения между supplicant и authentication server внутри RADIUS; всю проверку выполняет сервер.
?? Устройство прошло 802.1X (Authz Success), но осталось в VLAN по умолчанию, а не в ожидаемой. Где искать причину?
!! Сначала на RADIUS-сервере — отправляет ли он атрибуты Tunnel-Type/Tunnel-Private-Group-ID в Access-Accept; затем на коммутаторе — существует ли указанная VLAN.
?? TACACS+ сервер упал, и ни один администратор не может зайти на коммутаторы. Что забыли в aaa authentication login?
!! Резервный метод local в конце списка — без него недоступность сервера блокирует вход всем, включая администраторов.
```
