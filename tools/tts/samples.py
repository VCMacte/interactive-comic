# -*- coding: utf-8 -*-
"""Образцы всех дикторов Silero на репликах из комикса — чтобы выбрать роли."""
import os, wave
import torch
from torch.package import PackageImporter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'out', 'voices')
os.makedirs(OUT, exist_ok=True)
torch.set_num_threads(4)

imp = PackageImporter(os.path.join(HERE, 'models', 'v3_1_ru.pt'))
model = imp.load_pickle('tts_models', 'model')
model.to(torch.device('cpu'))

LINE = ('Стив открыл глаза. Квадратные деревья, квадратные облака. '
        'Погоди, Матвей? Ты меня видишь? Сколько будет три блока и ещё два блока?')

def save(audio, path, rate=24000):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((audio.numpy() * 32767).astype('int16').tobytes())

for speaker in ['aidar', 'baya', 'kseniya', 'xenia', 'eugene']:
    audio = model.apply_tts(text=LINE, speaker=speaker, sample_rate=24000)
    path = os.path.join(OUT, speaker + '.wav')
    save(audio, path)
    print('%-9s %4.1f с  %4d КБ' % (speaker, len(audio) / 24000, os.path.getsize(path) // 1024), flush=True)

print('\nфайлы:', os.path.abspath(OUT))
