---
id: aut-03-rest-api
dom: AUT
title: REST API
lead: Методы HTTP и CRUD, коды ответов, заголовки и аутентификация, идемпотентность и что именно нужно прочитать в примере запроса.
blueprint: ["6.5"]
minutes: 30
match:
  key: ["\\bREST\\b", "\\bAPI\\b", "\\bCRUD\\b", "HTTP (verb|method)", "\\bGET\\b.*\\bPOST\\b", "\\bPUT\\b|\\bPATCH\\b|\\bDELETE\\b", "status code", "\\b(200|201|400|401|403|404|500)\\b", "stateless", "\\bJSON\\b payload", "authentication.*api", "bearer token", "\\bRESTCONF\\b", "\\bNETCONF\\b"]
  re: ["api call", "endpoint.*uri", "request.*response.*header", "content-type", "token.*api", "basic auth", "\\bwebhook\\b"]
---

## Что делает REST API «REST»

REST — архитектурный стиль поверх HTTP. Признаки, которые спрашивают:

- **Клиент-серверная модель** и **отсутствие состояния** (stateless): каждый запрос
  самодостаточен, сервер не помнит предыдущий. Отсюда — токен или учётные данные **в
  каждом** запросе.
- **Ресурсы адресуются URI**: `/dna/intent/api/v1/network-device/42`.
- **Единообразный интерфейс**: одни и те же методы HTTP для любых ресурсов.
- Данные обычно в **JSON**, реже в XML.
- Кэшируемость и слоистость архитектуры.

## Методы и CRUD

| Метод | CRUD | Что делает | Идемпотентен |
|---|---|---|---|
| **GET** | Read | получить | да |
| **POST** | Create | создать новый объект | **нет** |
| **PUT** | Update/Replace | заменить объект целиком | да |
| **PATCH** | Update | изменить часть полей | обычно да |
| **DELETE** | Delete | удалить | да |

> [!key] Запомнить
> **Идемпотентность** — повторный одинаковый запрос не меняет результат. Пять раз PUT —
> объект в том же состоянии; пять раз POST — пять созданных объектов. На этом строится
> вопрос «какой метод безопасно повторить».

## Коды ответов

| Код | Класс | Значение |
|---:|---|---|
| **200** | 2xx — успех | OK, ответ в теле |
| **201** | | Created — объект создан |
| **204** | | No Content — успех, тела нет |
| **301/302** | 3xx | перенаправление |
| **400** | 4xx — ошибка клиента | Bad Request: тело или параметры неверны |
| **401** | | Unauthorized: **не аутентифицирован** |
| **403** | | Forbidden: аутентифицирован, но **прав не хватает** |
| **404** | | Not Found: ресурса нет |
| **429** | | Too Many Requests: превышен лимит |
| **500** | 5xx — ошибка сервера | Internal Server Error |

Разница **401 против 403** — любимая пара в вопросах: «кто ты, я не знаю» против «я знаю,
кто ты, и тебе нельзя».

## Как выглядит запрос

```txt
POST /dna/intent/api/v1/network-device HTTP/1.1
Host: sandbox.cisco.com
Content-Type: application/json
Accept: application/json
X-Auth-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6...

{
  "ipAddress": ["10.10.20.85"],
  "snmpVersion": "v3",
  "userName": "netadmin"
}
```

Составные части, которые просят назвать:

- **метод** — что делаем;
- **URI/endpoint** — над чем;
- **заголовки** — `Content-Type` (в каком формате отправляем), `Accept` (в каком хотим
  получить), заголовок аутентификации;
- **тело (payload)** — данные, обычно JSON; у GET его нет.

## Аутентификация

| Способ | Как выглядит | Замечание |
|---|---|---|
| **Basic** | `Authorization: Basic base64(user:pass)` | base64 — не шифрование, только HTTPS |
| **Token / Bearer** | `X-Auth-Token: …` или `Authorization: Bearer …` | сначала логин, потом токен во всех запросах |
| **API key** | ключ в заголовке или параметре | просто, но ключ легко утекает |
| **OAuth 2.0** | обмен на access token | для интеграций между сервисами |

Типичный сценарий с контроллером Cisco: POST на `/api/system/v1/auth/token` с Basic-логином
→ в ответ токен → все дальнейшие запросы с этим токеном.

## REST рядом с NETCONF и RESTCONF

| | REST | RESTCONF | NETCONF |
|---|---|---|---|
| Транспорт | HTTP(S) | HTTP(S) | **SSH** (порт 830) |
| Формат | JSON/XML | JSON/XML | XML |
| Модель данных | произвольная | **YANG** | **YANG** |
| Операции | методы HTTP | методы HTTP | `<get-config>`, `<edit-config>`, `<commit>` |

RESTCONF — «REST-обёртка» над теми же YANG-моделями, что использует NETCONF; NETCONF
старше, умеет транзакции и откат конфигурации.

## Что спрашивают

- «Which HTTP method creates a resource?» — POST.
- «Which method is idempotent?» — GET, PUT, DELETE (POST — нет).
- «What does 401 mean versus 403?» — не аутентифицирован против нет прав.
- «Which characteristic describes REST?» — stateless, ресурсы по URI, методы HTTP.
- «Which header specifies the format of the body?» — `Content-Type`.
- «Which protocol uses SSH port 830 and YANG?» — NETCONF.
- Разбор куска запроса: назвать метод, endpoint, тип аутентификации, формат данных.

## Проверь себя

```check
?? Какой метод HTTP соответствует операции Update целиком?
!! PUT (частичное изменение — PATCH).
?? Сервер вернул 403. Проблема в токене?
!! Нет: аутентификация прошла, не хватает прав. Отсутствие или недействительность токена дали бы 401.
?? Что означает stateless применительно к REST?
!! Сервер не хранит контекст между запросами — каждый запрос несёт всё необходимое, включая аутентификацию.
?? Зачем нужны заголовки Content-Type и Accept?
!! Первый сообщает формат отправляемого тела, второй — желаемый формат ответа.
?? Чем RESTCONF отличается от NETCONF?
!! Работает поверх HTTP(S) с методами HTTP и JSON/XML, тогда как NETCONF — поверх SSH с XML и собственными операциями.
```
