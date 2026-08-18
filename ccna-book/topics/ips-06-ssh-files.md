---
id: ips-06-ssh-files
dom: IPS
title: SSH, FTP и TFTP: управление устройством и файлами
lead: Настройка SSH по шагам, чем TFTP отличается от FTP, копирование конфигураций и образов IOS, порядок загрузки устройства.
blueprint: ["4.8", "4.9"]
minutes: 25
match:
  key: ["\\bTFTP\\b", "\\bFTP\\b", "copy (running|startup|tftp|flash)", "\\bIOS\\b image", "\\bSCP\\b", "backup.*configuration", "restore.*configuration"]
  re: ["\\bSSH\\b.*configur", "crypto key generate", "file transfer", "flash:", "startup-config", "running-config", "boot system", "\\bNVRAM\\b"]
---

## SSH: настройка по шагам

```cfg
hostname R1
ip domain-name example.com
crypto key generate rsa modulus 2048
ip ssh version 2
username admin privilege 15 secret S3cret!
!
line vty 0 15
 transport input ssh
 login local
```

Порядок не случаен: имя ключа строится из **hostname + domain-name**, поэтому без первых
двух команд третья не выполнится. Всё это подробно разбирается и в главе про доступ к
устройству — здесь важно, что этот же набор спрашивают и как часть домена IP-сервисов.

Проверка: `show ip ssh` (версия и длина ключа), `show ssh` (активные сессии).

## TFTP и FTP

| | TFTP | FTP |
|---|---|---|
| Транспорт | **UDP 69** | TCP 20/21 |
| Аутентификация | нет | логин и пароль |
| Возможности | только чтение и запись файла | листинг каталога, переименование, удаление, докачка |
| Надёжность | реализована внутри протокола, примитивно | обеспечивает TCP |
| Где применяют | загрузка образов и конфигураций устройства | обмен файлами общего назначения |

Из-за простоты TFTP влезает в загрузчик устройства — им пользуются при восстановлении, но
для повседневных задач он неудобен и небезопасен.

**SCP** — копирование поверх SSH; предпочтительный вариант там, где важна безопасность.

## Работа с конфигурациями

Два конфига, и их путают:

- **running-config** — в оперативной памяти, действует прямо сейчас, при перезагрузке
  теряется.
- **startup-config** — в NVRAM, загружается при старте.

```cli
R1# copy running-config startup-config     ! сохранить (то же самое, что write memory)
R1# copy running-config tftp:              ! резервная копия на сервер
Address or name of remote host []? 10.0.0.70
Destination filename [r1-confg]? r1-backup

R1# copy tftp: running-config              ! восстановить (СЛИЯНИЕ, не замена!)
R1# copy startup-config running-config     ! то же слияние
```

> [!trap] Ловушка
> `copy tftp: running-config` **сливает** файл с текущей конфигурацией: команды из файла
> добавляются, но то, чего в файле нет, не удаляется. Чтобы получить ровно ту
> конфигурацию, что в файле, копируют в **startup-config** и перезагружаются.

Сброс: `erase startup-config` (или `write erase`) + `reload`.

## Образы IOS

```cli
R1# show flash:
-#- --length-- -----date/time------ path
  1  108312884 Aug 12 2026 10:22:14 c2900-universalk9-mz.SPA.157-3.M.bin

R1# copy tftp: flash:                       ! залить новый образ
R1# verify /md5 flash:c2900-...bin          ! проверить целостность
R1(config)# boot system flash:c2900-universalk9-mz.SPA.157-3.M.bin
R1# show version                            ! какой образ загружен и откуда
```

Перед заливкой смотрят свободное место (`show flash:`), после — проверяют контрольную
сумму и только затем указывают `boot system` и перезагружаются.

## Порядок загрузки устройства

1. **POST** — самопроверка оборудования.
2. **Bootstrap** из ROM.
3. Поиск IOS: по командам `boot system` → первый образ во flash → TFTP → ROMmon.
4. Поиск конфигурации: **startup-config** в NVRAM → если её нет, запускается диалог
   первоначальной настройки (setup mode).

Значение **configuration register** `0x2102` — нормальная загрузка; `0x2142` — пропустить
startup-config, чем и пользуются при восстановлении забытого пароля.

## Что спрашивают

- «Which protocol uses UDP port 69?» — TFTP.
- «Which two capabilities does FTP have that TFTP lacks?» — аутентификация и работа с
  каталогами (листинг, удаление, переименование).
- «Which command backs up the configuration to a server?» — `copy running-config tftp:`.
- «What happens when a file is copied to running-config?» — слияние, а не замена.
- «Which command shows the IOS image in use?» — `show version`.
- «Where is startup-config stored?» — в NVRAM.

## Проверь себя

```check
?? Какой транспорт и порт у TFTP и почему его вообще используют?
!! UDP 69; он предельно прост, поэтому реализуется даже в загрузчике устройства.
?? Скопировали конфиг с TFTP в running-config. Почему устройство ведёт себя не так, как ожидалось?
!! Произошло слияние: старые команды, которых нет в файле, остались в силе.
?? Где хранится startup-config и что будет, если его стереть?
!! В NVRAM; после перезагрузки устройство запустится с пустой конфигурацией и предложит setup mode.
?? Чем SCP лучше TFTP для копирования конфигурации?
!! Работает поверх SSH — с аутентификацией и шифрованием.
?? Что означает configuration register 0x2142?
!! Пропустить startup-config при загрузке — режим восстановления пароля.
```
