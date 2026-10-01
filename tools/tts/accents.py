# -*- coding: utf-8 -*-
"""Расстановка ударений перед озвучкой.

Silero выбирает ударение сама и на омографах ошибается: «в горе» она читает
как «г+оре», хотя речь про гору с алмазами. Знак «+» перед гласной задаёт
ударение явно — это проверено: текст с «г+оре» звучит байт в байт как без
метки, а с «гор+е» иначе.

Правила живут в accents.json и применяются **только при озвучке**. Имена
файлов считаются от чистого текста сценария (tools/tts/collect.mjs), поэтому
новое правило не меняет ни одного идентификатора: перезаписываются ровно те
записи, которых оно касается.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
RULES_PATH = os.path.join(HERE, 'accents.json')

# Границы слова по русскому алфавиту: \b в Python считает кириллицу словом,
# но «+» и дефис внутри правил сбивают её с толку, поэтому проверяем сами.
LETTER = 'а-яёА-ЯЁ'


def load_rules(path=RULES_PATH):
    with open(path, encoding='utf-8') as f:
        return json.load(f)['rules']


def _restore_case(src, dst):
    """Правила пишутся строчными, а фраза может начинать предложение."""
    if src[:1].isupper():
        for i, ch in enumerate(dst):
            if ch.isalpha():
                return dst[:i] + ch.upper() + dst[i + 1:]
    return dst


def apply_rules(text, rules):
    """Возвращает текст с расставленными ударениями."""
    for rule in rules:
        pattern = re.compile(
            '(?<![%s])%s(?![%s])' % (LETTER, re.escape(rule['from']), LETTER),
            re.IGNORECASE)
        text = pattern.sub(lambda m: _restore_case(m.group(0), rule['to']), text)
    return text
