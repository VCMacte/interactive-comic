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
    название: 'русского нет вовсе',
    voices: [V('Microsoft David', 'en-US')],
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
console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
