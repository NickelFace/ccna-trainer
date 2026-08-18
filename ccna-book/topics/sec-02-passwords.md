---
id: sec-02-passwords
dom: SEC
title: Пароли и защита доступа к устройству
lead: enable secret против enable password, локальные пользователи и уровни привилегий, политика паролей, MFA и сертификаты.
blueprint: ["5.3", "5.4"]
minutes: 30
match:
  key: ["enable secret", "enable password", "service password-encryption", "username.*secret", "password policy", "privilege level", "\\bMFA\\b|multifactor", "biometric", "certificate.*authentication", "login block-for"]
  re: ["local password", "password complexity", "banner motd", "exec-timeout", "device access control", "strong password"]
---

## Пароли на устройстве Cisco

| Команда | Что защищает | Как хранится |
|---|---|---|
| `enable password` | привилегированный режим | **открытым текстом** |
| `enable secret` | привилегированный режим | хеш (type 5/8/9) |
| `line console 0` + `password` | консольный вход | открытым текстом |
| `line vty` + `password` | удалённый вход | открытым текстом |
| `username … secret` | конкретного пользователя | хеш |
| `service password-encryption` | все открытые пароли в конфиге | слабый обратимый **type 7** |

Правило, которое проверяют: **`enable secret` перекрывает `enable password`**, если заданы
оба. И второе: `service password-encryption` — не защита, а маскировка; type 7
расшифровывается онлайн за секунду. Настоящая защита — хеши (`secret`).

```cfg
enable secret S0me-Strong-Pass
service password-encryption
!
username admin privilege 15 secret Admin-Pass
username monitor privilege 1 secret View-Pass
!
line console 0
 login local
 exec-timeout 5 0
line vty 0 15
 login local
 transport input ssh
 exec-timeout 10 0
 access-class 10 in
!
banner motd ^Authorized access only. Activity is logged.^
```

## Уровни привилегий

- **0** — почти ничего (`logout`, `enable`, `exit`).
- **1** — обычный пользовательский режим (`>`), только просмотр.
- **15** — полный доступ (`#`).
- Промежуточные 2–14 настраивают вручную, разрешая отдельные команды:

```cfg
privilege exec level 5 show running-config
username helpdesk privilege 5 secret Help-Pass
```

Это реализация least privilege на устройстве: инженеру поддержки — просмотр, администратору
— всё. Более гибкий вариант — **role-based CLI** (views), но на экзамене чаще спрашивают
именно уровни.

## Политика паролей

Что считается сильной политикой:

- длина от 8–12 символов, смесь регистров, цифр и спецсимволов;
- запрет словарных слов и повторного использования;
- регулярная смена — и **обязательная** смена паролей по умолчанию;
- блокировка после нескольких неудачных попыток;
- многофакторность там, где доступ критичен.

```cfg
security passwords min-length 10
login block-for 120 attempts 3 within 60      ! 3 неудачи за минуту → пауза 2 минуты
login on-failure log
login on-success log
```

`login block-for` — прямой ответ на вопросы «как затруднить перебор пароля на устройстве».

## Что сильнее пароля

- **MFA** — второй фактор (токен, приложение, аппаратный ключ). Компрометация пароля
  перестаёт быть достаточной.
- **Сертификаты** — асимметричная пара ключей; нечего подбирать, нечего подсмотреть.
  Используются в 802.1X (EAP-TLS), VPN, доступе к API.
- **Биометрия** — удобна, но не заменяет пароль полностью: отпечаток нельзя сменить после
  компрометации.
- **Централизованная аутентификация** (RADIUS/TACACS+) — учётки живут не на устройстве, и
  уволенного сотрудника достаточно отключить в одном месте.

## Ещё несколько обязательных мер

- **Баннер** `motd`/`login` с предупреждением о законности доступа — юридически значимая
  мелочь, которую спрашивают.
- **`exec-timeout`** — забытая открытая сессия закрывается сама.
- **`access-class`** на vty — заходить можно только с адресов управления.
- Выключить неиспользуемое: `no ip http server`, лишние службы, неиспользуемые порты в
  `shutdown`.

## Что спрашивают

- «Which command encrypts the privileged EXEC password with a hash?» — `enable secret`.
- «What does service password-encryption actually provide?» — слабое обратимое
  шифрование, защита только от случайного взгляда.
- «Which privilege level gives full access?» — 15.
- «Which two are examples of MFA?» — пароль + токен/отпечаток.
- «Which command limits repeated login attempts?» — `login block-for … attempts …
  within …`.
- «Which command restricts SSH access to specific source addresses?» — `access-class` на
  линиях vty.

## Проверь себя

```check
?? Заданы и enable password, и enable secret. Какой сработает?
!! enable secret — он всегда перекрывает enable password.
?? Насколько надёжен пароль под service password-encryption?
!! Ненадёжен: type 7 обратим и расшифровывается мгновенно; надёжны только хеши secret.
?? Какой уровень привилегий у пользователя, попавшего в режим с приглашением «>»?
!! Первый — только просмотр.
?? Как ограничить перебор паролей на самом устройстве?
!! login block-for N attempts M within T — после M неудач за T секунд вход блокируется на N секунд.
?? Чем сертификат лучше пароля для аутентификации?
!! Его нельзя подобрать перебором и подсмотреть при вводе; закрытый ключ не передаётся по сети.
```
