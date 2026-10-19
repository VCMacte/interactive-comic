// voice.js обращается к браузерным объектам на верхнем уровне — подменяем их.
const makeEnv = (voices) => {
  const synth = {
    speaking: false, pending: false,
    getVoices: () => voices,
    cancel() {}, speak() {}, addEventListener() {},
  };
  globalThis.window = { SpeechRecognition: null, webkitSpeechRecognition: null, speechSynthesis: synth };
  globalThis.speechSynthesis = synth;
};

const V = (name, lang, localService = true) => ({ name, lang, localService });

const cases = [
  {
    название: 'Android: Google против встроенного',
    voices: [V('Russian (compact)', 'ru-RU'), V('Google русский', 'ru-RU', false)],
    ждём: 'Google русский',
  },
  {
    название: 'Windows: единственный русский среди английских',
    voices: [V('Microsoft David', 'en-US'), V('Microsoft Irina', 'ru-RU'), V('Microsoft Zira', 'en-US')],
    ждём: 'Microsoft Irina',
  },
  {
    название: 'нейросетевой голос предпочтительнее обычного',
    voices: [V('Russian Male', 'ru-RU'), V('Russian Natural', 'ru-RU')],
    ждём: 'Russian Natural',
  },
  {
    // Лучше нерусский голос, чем тишина: в браузере телевизора русского
    // не оказалось, и роли оставались вообще без голоса — движок молчал.
    название: 'русского нет — берём любой, лишь бы звучало',
    voices: [V('Microsoft David', 'en-US')],
    ждём: 'Microsoft David',
  },
  {
    название: 'голосов нет вовсе',
    voices: [],
    ждём: 'голос не найден',
  },
  {
    название: 'формат языка через подчёркивание',
    voices: [V('Milena', 'ru_RU')],
    ждём: 'Milena',
  },
  {
    название: 'два голоса достаются разным ролям',
    voices: [V('Google русский', 'ru-RU'), V('Microsoft Irina', 'ru-RU')],
    ждём: 'Google русский',
  },
];

let failed = 0;
for (const c of cases) {
  makeEnv(c.voices);
  const mod = await import('./js/voice.js?v=' + Math.random());
  const got = mod.voiceReport().narrator;
  const ok = got === c.ждём;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.название}: ${got}`);
}
/* ---------------- индекс готовой озвучки ---------------- */

// Здесь ловится самый коварный отказ озвучки: не тишина, а чужой голос.
// Если загрузка `assets/audio/index.json` сорвалась и пустой результат
// запомнился, `hasClip` отвечает «нет» на всё, и каждая реплика до конца
// сеанса идёт браузерным синтезом. Рассказчик при этом звучит встроенным
// голосом телефона вместо ровной `baya` — именно это и услышали.

const audioEnv = (fetchImpl) => {
  globalThis.indexedDB = undefined;      // журнал молча выключится
  globalThis.fetch = fetchImpl;
};

const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`
    + (ok ? '' : `\n      вышло ${JSON.stringify(got)}, ждали ${JSON.stringify(want)}`));
};

{
  // Первый запрос падает, второй отвечает. Пустой индекс не должен
  // запомниться: следующая реплика обязана попробовать снова.
  let calls = 0;
  audioEnv(async () => {
    calls++;
    if (calls === 1) throw new Error('сеть моргнула');
    return { json: async () => ['aaaa0001', 'aaaa0002'] };
  });
  const audio = await import('./js/audio.js?v=' + Math.random());

  const first = await audio.loadIndex();
  check('сбой сети не запоминается: индекс пуст, но не окончателен', first.size, 0);

  const second = await audio.loadIndex();
  check('следующая реплика загружает индекс заново', [second.size, calls], [2, 2]);

  const third = await audio.loadIndex();
  check('удачная загрузка больше не повторяется', calls, 2);
}

{
  // Одна сцена зовёт loadIndex на каждую реплику. Запрос должен быть один.
  let calls = 0;
  audioEnv(async () => {
    calls++;
    await new Promise(r => setTimeout(r, 5));
    return { json: async () => ['bbbb0001'] };
  });
  const audio = await import('./js/audio.js?v=' + Math.random());
  await Promise.all([audio.loadIndex(), audio.loadIndex(), audio.loadIndex()]);
  check('одновременные вызовы шлют один запрос', calls, 1);
}

{
  // И то, ради чего индекс существует: по тексту и роли находится запись.
  audioEnv(async () => ({ json: async () => [] }));
  const audio = await import('./js/audio.js?v=' + Math.random());
  const id = audio.clipId('Верно! Молодец.', 'narrator');
  audioEnv(async () => ({ json: async () => [id] }));
  const audio2 = await import('./js/audio.js?v=' + Math.random());
  await audio2.loadIndex();
  check('запись находится по тексту и роли', audio2.hasClip('Верно! Молодец.', 'narrator'), true);
  check('та же реплика другой ролью — другая запись',
    audio2.hasClip('Верно! Молодец.', 'hero'), false);
}

console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
