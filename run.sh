#!/usr/bin/env bash
# Запуск офлайн-тренажёра CCNA 200-301.
# После старта открой в браузере: http://localhost:8099
cd "$(dirname "$0")"
python3 -m http.server 8099 --directory ccna-exam-simulator
