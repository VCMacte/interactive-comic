# -*- coding: utf-8 -*-
"""Озвучивает манифест нейросетевым синтезом Silero.

Модель грузим из файла в проекте, а не через torch.hub: кэш torch лежит
в профиле пользователя, в пути есть кириллица, и загрузчик на ней падает.

Ударения расставляются по accents.json: Silero ошибается на омографах
(«в горе» читает как «г+оре»). Имена файлов считаются от чистого текста,
поэтому правило не ломает ни одной посторонней записи.

Запуск: python tools/tts/render.py [--restress]
Уже готовые файлы пропускаются, так что прогон можно прерывать и повторять.
С --restress заново озвучиваются реплики, которых касаются правила ударения.
"""
import json
import os
import sys
import wave

import torch
from torch.package import PackageImporter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from accents import load_rules, apply_rules

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'models', 'v3_1_ru.pt')
MANIFEST = os.path.join(HERE, 'manifest.json')
WAV_DIR = os.path.join(HERE, 'wav')
RATE = 24000

# Роль -> диктор Silero. Менять здесь: голоса подбираются на слух,
# и это единственное место, где они назначаются.
SPEAKERS = {
    'narrator': 'baya',
    'hero': 'aidar',
    'friend': 'xenia',
    'kid': 'kseniya',
    'villain': 'eugene',
    'beast': 'eugene',
    # Свободных дикторов у v3 больше нет, поэтому новые роли разводятся темпом
    # (см. RATE_SCALE). Алекс — та же kseniya, что у свинолюда, но медленнее;
    # встретиться в одной истории им негде: свинолюд живёт в Нижнем мире.
    'ally': 'kseniya',
    'golem': 'eugene',
}

# Темп у ролей разный, как и в браузерной озвучке: рассказчик спокойнее,
# герой живее. Silero скоростью не управляет, поэтому меняем частоту
# воспроизведения — на небольших отклонениях это слышно как темп речи,
# а не как искажение голоса.
RATE_SCALE = {
    'narrator': 1.00,
    'hero': 1.06,
    'friend': 1.03,
    'kid': 1.08,
    'villain': 0.92,
    'beast': 0.88,
    'ally': 0.97,
    'golem': 0.80,   # ниже и медленнее зверя — голос железного
}


def main():
    if not os.path.exists(MODEL):
        sys.exit('нет модели: ' + MODEL)

    with open(MANIFEST, encoding='utf-8') as f:
        items = json.load(f)

    os.makedirs(WAV_DIR, exist_ok=True)
    rules = load_rules()

    # --restress: правила ударения изменились, и надо переозвучить ровно те
    # реплики, которых они касаются. Имена файлов от этого не меняются —
    # они считаются от чистого текста, — поэтому достаточно убрать WAV.
    if '--restress' in sys.argv:
        dropped = 0
        for i in items:
            if apply_rules(i['text'], rules) == i['text']:
                continue
            wav = os.path.join(WAV_DIR, i['id'] + '.wav')
            if os.path.exists(wav):
                os.remove(wav)
                dropped += 1
        print('под правила ударения попало реплик: %d' % dropped, flush=True)

    todo = [i for i in items if not os.path.exists(os.path.join(WAV_DIR, i['id'] + '.wav'))]
    print('всего реплик: %d, осталось озвучить: %d' % (len(items), len(todo)), flush=True)
    if not todo:
        return

    print('правил ударения: %d' % len(rules), flush=True)

    torch.set_num_threads(4)
    imp = PackageImporter(MODEL)
    model = imp.load_pickle('tts_models', 'model')
    model.to(torch.device('cpu'))

    done = 0
    for item in todo:
        speaker = SPEAKERS.get(item['role'], SPEAKERS['narrator'])
        try:
            audio = model.apply_tts(
                text=apply_rules(item['text'], rules),
                speaker=speaker,
                sample_rate=RATE,
                put_accent=True,   # без ударений русская речь звучит чужой
                put_yo=True,
            )
        except Exception as e:
            print('ПРОПУСК %s: %s' % (item['id'], e), flush=True)
            continue

        out = os.path.join(WAV_DIR, item['id'] + '.wav')
        rate = int(RATE * RATE_SCALE.get(item['role'], 1.0))
        with wave.open(out, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes((audio.numpy() * 32767).astype('int16').tobytes())

        done += 1
        if done % 10 == 0 or done == len(todo):
            print('озвучено %d из %d' % (done, len(todo)), flush=True)

    total = sum(os.path.getsize(os.path.join(WAV_DIR, f)) for f in os.listdir(WAV_DIR))
    print('готово. WAV на диске: %d МБ' % (total // 1024 // 1024), flush=True)


if __name__ == '__main__':
    main()
