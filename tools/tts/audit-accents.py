# -*- coding: utf-8 -*-
"""Сплошная проверка: какое ударение Silero ставит в каждом слове корпуса.

Список подозрительных слов руками всегда неполон, а слушать четыре сотни
записей невозможно. Поэтому спрашиваем саму модель: синтезируем слово
по разу на каждую гласную и смотрим, какой вариант совпал с тем, что модель
произносит без подсказки. Совпал — значит туда она ударение и ставит.

Слово проверяется отдельно от фразы: так на порядок быстрее, а системные
ошибки (доск+и вместо д+оски) видны всё равно. Контекстные омографы
(«в горе» — гора или горе) ловит check-accents.py на целых репликах.

Запуск: python tools/tts/audit-accents.py > accents-audit.txt
"""
import json
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import torch
from torch.package import PackageImporter

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'models', 'v3_1_ru.pt')
MANIFEST = os.path.join(HERE, 'manifest.json')
RATE = 24000
VOWELS = 'аеиоуыэюяё'


def main():
    with open(MANIFEST, encoding='utf-8') as f:
        items = json.load(f)

    words = {}
    for it in items:
        for w in re.findall('[а-яё]+', it['text'].lower()):
            if 'ё' in w:                      # ё всегда под ударением
                continue
            if sum(c in VOWELS for c in w) < 2:
                continue
            words.setdefault(w, it['text'])

    torch.set_num_threads(4)
    imp = PackageImporter(MODEL)
    model = imp.load_pickle('tts_models', 'model')
    model.to(torch.device('cpu'))

    def say(text):
        return model.apply_tts(text=text, speaker='baya', sample_rate=RATE,
                               put_accent=True, put_yo=True).numpy()

    print('слово -> куда Silero ставит ударение (? — не определилось)\n')
    unknown = []
    for n, word in enumerate(sorted(words), 1):
        plain = say(word)
        chosen = None
        for i, ch in enumerate(word):
            if ch not in VOWELS:
                continue
            marked = say(word[:i] + '+' + word[i:])
            if len(marked) == len(plain) and np.allclose(marked, plain, atol=1e-4):
                chosen = word[:i] + '+' + word[i:]
                break
        if chosen:
            print(chosen)
        else:
            unknown.append(word)
            print(word + '   ?')
        if n % 50 == 0:
            print('... %d из %d' % (n, len(words)), file=sys.stderr, flush=True)

    print('\nвсего слов: %d, не определилось: %d' % (len(words), len(unknown)))


if __name__ == '__main__':
    main()
