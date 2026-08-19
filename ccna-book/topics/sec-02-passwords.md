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

## Разбор: типы хеша за словом secret

`enable secret` и `username … secret` не всегда используют одинаково стойкий хеш — тип
виден прямо в running-config:

```txt
enable secret 5 $1$mERr$hx5rVt7rPNoS4wqbXKX7m0     ! type 5, MD5-based — устаревший
enable secret 9 $9$8pjSXpm7VmJdSA$...               ! type 9, scrypt — современный, медленный для перебора
```

Экзаменационная суть не в деталях алгоритма, а в направлении: **более новые типы (8, 9)
сознательно медленные** — это специально замедляет перебор паролей офлайн (атакующему с
украденной конфигурацией нужно на порядки больше времени на подбор), в отличие от
быстрого MD5 в type 5. Если платформа поддерживает `algorithm-type scrypt` (type 9), его
стоит предпочесть настройке по умолчанию:

```cfg
username admin algorithm-type scrypt secret Admin-Pass
```

Ключевой факт — тип 7 (`service password-encryption`) **не хеш вовсе**, а обратимое
шифрование, и вопрос «сколько времени займёт восстановить пароль type 7» имеет ответ
«практически мгновенно онлайн-инструментом» — этим он принципиально отличается от 5/8/9.

## Диагностика: администратор сам заблокировал себе вход

**Симптом.** После настройки `login block-for` для защиты от перебора администратор
трижды ошибся при вводе своего же пароля (обычная опечатка) и теперь не может зайти по
SSH вовсе — попытки просто не отвечают.

**Что смотрим и понимаем.** `login block-for 120 attempts 3 within 60` реагирует на
неудачные попытки **не персонально**, а по количеству неудач **со всех источников за
период** — при срабатывании блокируется вход **всем**, кроме адресов из специального
исключающего ACL, если он настроен:

```cfg
login quiet-mode access-class QUIET-EXEMPT
```

**Что нашли.** Без `quiet-mode access-class` администратор блокирует сам себя точно так
же, как заблокировал бы атакующего, — и до истечения таймера (`120` секунд в примере) вход
по сети недоступен никому. Единственный путь войти в этот момент — консоль, которая под
`login block-for` обычно не подпадает (правило распространяется на login-попытки в
принципе, но на практике консоль остаётся физическим out-of-band доступом и приоритетнее
рассматривается отдельно). Отсюда практический вывод для настройки: заранее выделить
доверенный диапазон адресов управления в `quiet-mode access-class`, чтобы блокировка не
превращалась в самостоятельный отказ в обслуживании для легитимных администраторов.

> [!trap] Ловушка
> `login block-for` защищает от перебора, но без исключения для доверенных адресов может
> стать инструментом DoS на самого себя — это не гипотетика, а реальный сценарий, который
> проверяют формулировкой «why did the administrator get locked out along with the
> attacker».

## Разбор задачи: custom privilege level по шагам

Нужно дать сотруднику поддержки право смотреть конфигурацию и перезапускать интерфейсы, но
не менять маршрутизацию и не создавать пользователей.

```cfg
privilege exec level 5 show running-config
privilege exec level 5 configure terminal
privilege interface level 5 shutdown
privilege interface level 5 no shutdown
!
enable secret level 5 Level5Pass
username helpdesk privilege 5 secret Help-Pass
```

Логика назначения: команды `privilege … level 5 …` разрешают **конкретные** команды на
пятом уровне (по умолчанию доступны только базовые команды уровней 0–1), а `enable secret
level 5` задаёт отдельный пароль для входа именно на этот уровень — сотрудник поддержки
никогда не видит пароль уровня 15. Проверка результата:

```cli
SW1> enable 5
Password: ********
SW1# show running-config
!... доступно
SW1# router ospf 1
% Invalid input detected
```

Команда `show running-config` разрешена явно, а `router ospf 1` — нет, потому что ни на
одном уровне ниже 15 конфигурация протоколов маршрутизации не открывалась. Это ровно
принцип least privilege на практике: доступ выдан **по списку команд**, а не «немного
меньше, чем всё».

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
- «Why is a type 9 secret preferred over a type 5 secret?» — type 9 (scrypt) намеренно
  медленный для перебора, type 5 (MD5-based) взламывается офлайн значительно быстрее.
- «An administrator configured login block-for and is later locked out along with an
  attacker. What was missing?» — исключающий ACL через `login quiet-mode access-class`
  для доверенных адресов управления.
- «How can a support engineer be given access to specific commands without full
  privilege 15?» — назначить команды конкретному промежуточному уровню (`privilege exec
  level N <команда>`) и создать пользователя с этим уровнем.

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
?? Чем type 9 secret отличается от type 5 в контексте защиты от перебора?
!! Type 9 (scrypt) намеренно медленный алгоритм — офлайн-перебор занимает на порядки больше времени, чем у быстрого MD5-based type 5.
?? После настройки login block-for администратор трижды ошибся паролем и сам оказался заблокирован наравне с атакующим. Что нужно было настроить заранее?
!! login quiet-mode access-class с ACL доверенных адресов управления — без него блокировка распространяется на все источники без исключения.
?? Сотруднику поддержки нужен доступ к show running-config и перезапуску интерфейсов, но не к настройке маршрутизации. Как это оформить без выдачи privilege 15?
!! Назначить нужные команды промежуточному уровню (privilege exec level 5 show running-config и т.п.) и создать пользователя с username ... privilege 5 — доступ ограничен явным списком команд.
```
