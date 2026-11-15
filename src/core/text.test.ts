import { describe, expect, it } from 'vitest';
import { cleanTitle, excerpt, findMentions, linkContext, linkFirstMention, norm, plainText, renameLinks, scanLinks, taskStats, toggleTaskAtLine } from './text';

describe('ссылки [[…]]', () => {
  it('находит простые и типизированные ссылки', () => {
    const links = scanLinks('Работает поверх [[HTTP|требует знания]], см. [[CORS]] и [[ rest  api |подпись]].');
    expect(links.map((l) => [l.title, l.label])).toEqual([
      ['HTTP', 'требует знания'],
      ['CORS', null],
      ['rest api', 'подпись'],
    ]);
  });

  it('не видит ссылки в коде', () => {
    expect(scanLinks('`[[A]]` и\n```\n[[B]]\n```\nа вот [[C]]').map((l) => l.title)).toEqual(['C']);
  });

  it('игнорирует пустые и многострочные скобки', () => {
    expect(scanLinks('[[]] [[ ]] [[a\nb]]')).toEqual([]);
  });

  it('переименовывает ссылки, сохраняя тип, без учёта регистра', () => {
    expect(renameLinks('[[http|использует]] и [[HTTP]], но не [[HTTPS]] и не `[[HTTP]]`', 'HTTP', 'Протокол HTTP')).toBe(
      '[[Протокол HTTP|использует]] и [[Протокол HTTP]], но не [[HTTPS]] и не `[[HTTP]]`',
    );
  });

  it('очищает название от символов разметки', () => {
    expect(cleanTitle('  A [b] | c\n d ')).toBe('A b c d');
    expect(norm('  REST   Api ')).toBe('rest api');
    expect(norm('Ёлка')).toBe(norm('ёлка'));
  });

  it('даёт строку с ссылкой для обратных упоминаний', () => {
    expect(linkContext('Первая строка.\nВторая про [[CSS]] и стили.\nТретья.', 'css')).toBe('Вторая про [[CSS]] и стили.');
    expect(linkContext('без ссылок', 'CSS')).toBe('');
  });
});

describe('пункты с отметками', () => {
  const text = '- [ ] один\n- [x] два\n```\n- [ ] в коде\n```\n1. [ ] три\n- обычный';

  it('считает пункты вне кода', () => {
    expect(taskStats(text)).toEqual({ all: 3, done: 1 });
  });

  it('переключает отметку в нужной строке', () => {
    expect(toggleTaskAtLine(text, 1).split('\n')[0]).toBe('- [x] один');
    expect(toggleTaskAtLine(text, 2).split('\n')[1]).toBe('- [ ] два');
    expect(toggleTaskAtLine(text, 6).split('\n')[5]).toBe('1. [x] три');
  });

  it('не трогает код и обычные строки', () => {
    expect(toggleTaskAtLine(text, 4)).toBe(text);
    expect(toggleTaskAtLine(text, 7)).toBe(text);
  });
});

describe('неявные упоминания', () => {
  const pages = [
    { id: '1', title: 'HTTP' },
    { id: '2', title: 'REST API' },
    { id: '3', title: 'CSS' },
    { id: '4', title: 'Go' },
  ];

  it('находит названия без ссылки целыми словами', () => {
    const text = 'Протокол http нужен для rest  api. А HTTPS и Google — другое. [[CSS]] уже ссылка.';
    expect(findMentions(text, pages).map((p) => p.title)).toEqual(['HTTP', 'REST API']);
  });

  it('не предлагает саму страницу и текст в коде', () => {
    expect(findMentions('HTTP и `CSS`', pages, ['1'])).toEqual([]);
  });

  it('делает ссылкой только первое упоминание', () => {
    expect(linkFirstMention('Про http и ещё раз HTTP.', 'HTTP')).toBe('Про [[HTTP]] и ещё раз HTTP.');
    expect(linkFirstMention('`HTTP` в коде, затем HTTP', 'HTTP')).toBe('`HTTP` в коде, затем [[HTTP]]');
    expect(linkFirstMention('нет упоминаний', 'HTTP')).toBe('нет упоминаний');
  });
});

describe('текст без разметки', () => {
  it('убирает разметку и раскрывает ссылки', () => {
    expect(plainText('## Заголовок\n- [x] **пункт** про [[HTTP|использует]]\n> цитата `код`')).toBe('Заголовок\nпункт про HTTP\nцитата код');
  });

  it('обрезает описание', () => {
    expect(excerpt('а'.repeat(200), 10)).toBe('аааааааааа…');
  });
});
