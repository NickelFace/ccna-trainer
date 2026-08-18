---
id: sec-05-aaa
dom: SEC
title: AAA, RADIUS, TACACS+ и 802.1X
lead: Три «A» по отдельности, чем TACACS+ отличается от RADIUS, как устроена аутентификация порта по 802.1X.
blueprint: ["5.5"]
minutes: 30
match:
  key: ["\\bAAA\\b", "\\bRADIUS\\b", "\\bTACACS\\+?\\b", "802\\.1X", "authentication.*authorization.*accounting", "supplicant", "authenticator"]
  re: ["aaa new-model", "authentication server", "identity.*network access", "\\bEAP\\b", "accounting record", "centralized authentication"]
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

## Что спрашивают

- «Which protocol separates authentication and authorization?» — TACACS+.
- «Which protocol encrypts the entire packet?» — TACACS+ (RADIUS шифрует только пароль).
- «Which transport and port does TACACS+ use?» — TCP 49.
- «What is the role of the supplicant/authenticator/authentication server?» — клиент,
  коммутатор, RADIUS.
- «Which AAA element records what a user did?» — accounting.
- «What happens if the AAA server is unreachable and no local fallback is configured?» —
  вход становится невозможен.

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
```
