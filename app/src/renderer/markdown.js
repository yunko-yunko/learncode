import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import { esc, icon, paintIcons } from './ui.js';

hljs.registerLanguage('python', python); hljs.registerLanguage('json', json);
const renderer = new marked.Renderer();
renderer.code = function (token) {
  const code = token.text || '';
  const lang = (token.lang || 'python').split(/\s/)[0].toLowerCase();
  const normalized = ['py','python','fastapi'].includes(lang) ? 'python' : lang;
  const highlighted = hljs.getLanguage(normalized) ? hljs.highlight(code, { language: normalized }).value : esc(code);
  return `<div class="code-block"><div class="code-block-header"><span><span class="code-lang-dot"></span>${esc(normalized === 'python' ? 'Python' : normalized)}</span><div><button data-action="block-theme" aria-label="코드 테마 전환" title="코드 테마 전환">${icon('sun')}</button><button data-action="copy-code" aria-label="복사" title="복사">${icon('copy')}</button></div></div><pre><code class="hljs language-${esc(normalized)}">${highlighted}</code></pre></div>`;
};
marked.setOptions({ renderer, gfm: true, breaks: false });
export function markdown(content) {
  return DOMPurify.sanitize(marked.parse(content || '*내용이 없습니다.*'), {
    ADD_ATTR: ['target', 'data-action', 'data-lucide', 'aria-label'],
    FORBID_TAGS: ['iframe','object','embed','form','input','style','script','video','audio'],
    FORBID_ATTR: ['srcset'],
  });
}
export function renderMarkdown(element, content) { element.innerHTML = markdown(content); paintIcons(element); }
