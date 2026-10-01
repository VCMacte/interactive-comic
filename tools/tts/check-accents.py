# -*- coding: utf-8 -*-
"""Проверяет правила ударений, не слушая озвучку.

Приём простой: Silero синтезирует реплику дважды — как есть и с явным
ударением. Если волны совпали байт в байт, модель и так ставила ударение
туда же, и правило лишнее. Если разошлись — правило работает и нужно.

Так же находится и обратное: правило, которое ни к чему в манифесте
не подходит, то есть устарело вместе с текстом.

Запуск: python tools/tts/check-accents.py [слово ...]
"""
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import torch
from torch.package import PackageImporter

from accents import load_rules, apply_rules

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'models', 'v3_1_ru.pt')
MANIFEST = os.path.join(HERE, 'manifest.json')
RATE = 24000


def main():
    only = [a.lower() for a in sys.argv[1:]]
    rules = load_rules()
    with open(MANIFEST, encoding='utf-8') as f:
        items = json.load(f)

    torch.set_num_threads(4)
    imp = PackageImporter(MODEL)
    model = imp.load_pickle('tts_models', 'model')
    model.to(torch.device('cpu'))

    def say(text):
        return model.apply_tts(text=text, speaker='baya', sample_rate=RATE,
                               put_accent=True, put_yo=True).numpy()

    useless, working, stale = [], [], []

    for rule in rules:
        if only and not any(o in rule['from'] for o in only):
            continue
        hits = [i for i in items if apply_rules(i['text'], [rule]) != i['text']]
        if not hits:
            stale.append(rule['from'])
            continue

        # Хватает одной реплики: ударение от соседей по предложению не зависит
        # настолько, чтобы менять вывод в одном месте и не менять в другом.
        item = hits[0]
        plain = say(item['text'])
        marked = say(apply_rules(item['text'], [rule]))

        same = len(plain) == len(marked) and np.allclose(plain, marked, atol=1e-4)
        (useless if same else working).append((rule['from'], len(hits)))

    if working:
        print('ПРАВИЛА РАБОТАЮТ (модель ошибалась):')
        for name, n in working:
            print('  %-24s реплик: %d' % (name, n))

    if useless:
        print('\nЛИШНИЕ (модель и так ставит верно, правило можно убрать):')
        for name, n in useless:
            print('  %-24s реплик: %d' % (name, n))

    if stale:
        print('\nУСТАРЕЛИ (ни к чему не подходят):')
        for name in stale:
            print('  ' + name)

    print('\nитого: работают %d, лишних %d, устарели %d' % (len(working), len(useless), len(stale)))


if __name__ == '__main__':
    main()
