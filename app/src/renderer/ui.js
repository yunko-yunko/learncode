import { createIcons, House, BookOpen, Bookmark, Plus, ArrowUpRight, ArrowRight, ArrowLeft, ChevronRight, ChevronDown, Search, Sun, Moon, Settings2, FolderOpen, Download, Upload, Check, X, Minus, Square, Pencil, Play, SquareTerminal, Code2, FileCode2, Folder, FilePlus2, Trash2, RotateCcw, Copy, CheckCheck, PanelLeftClose, PanelLeftOpen, ExternalLink, Ellipsis, Bold, Italic, Strikethrough, Heading2, Link, Table2, List, Quote, Eye, Columns2, Save, GripVertical, Clock3, Layers, Flame, Zap, CircleHelp, LayoutGrid, MoveUp, MoveDown, LoaderCircle, Info, PackageOpen, CircleCheck, Circle, NotebookPen, WrapText } from 'lucide';
const icons = { House, BookOpen, Bookmark, Plus, ArrowUpRight, ArrowRight, ArrowLeft, ChevronRight, ChevronDown, Search, Sun, Moon, Settings2, FolderOpen, Download, Upload, Check, X, Minus, Square, Pencil, Play, SquareTerminal, Code2, FileCode2, Folder, FilePlus2, Trash2, RotateCcw, Copy, CheckCheck, PanelLeftClose, PanelLeftOpen, ExternalLink, Ellipsis, Bold, Italic, Strikethrough, Heading2, Link, Table2, List, Quote, Eye, Columns2, Save, GripVertical, Clock3, Layers, Flame, Zap, CircleHelp, LayoutGrid, MoveUp, MoveDown, LoaderCircle, Info, PackageOpen, CircleCheck, Circle, NotebookPen, WrapText };
export const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
export function paintIcons(root = document) { createIcons({ icons, root, attrs: { 'stroke-width': 1.7 } }); }
export const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export const uid = () => crypto.randomUUID();
export function toast(message, type = 'success') {
  const element = document.createElement('div'); element.className = `toast ${type}`;
  element.innerHTML = `${icon(type === 'error' ? 'info' : 'circle-check')}<span>${esc(message)}</span>`;
  document.querySelector('#toasts').append(element); paintIcons(element);
  setTimeout(() => element.remove(), 4500);
}
let previousFocus;
export function closeModal() { document.querySelector('#modal-root').innerHTML = ''; previousFocus?.focus(); }
export function modal(title, body, footer = '', options = {}) {
  previousFocus = document.activeElement;
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-overlay"><section role="dialog" aria-modal="true" aria-label="${esc(title)}" class="modal ${options.wide ? 'wide' : ''}"><header><div><h2>${esc(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('x')}</button></header><div class="modal-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section></div>`;
  paintIcons(root);
  root.querySelector('input, button, select, textarea')?.focus();
  root.querySelector('.modal-overlay').addEventListener('click', event => { if (event.target === event.currentTarget && !options.locked) closeModal(); });
}
export function confirmModal(title, message, callback, label = '확인') {
  modal(title, `<p class="muted">${esc(message)}</p>`, `<button class="button secondary" data-action="close-modal">취소</button><button class="button primary" id="confirm-modal">${esc(label)}</button>`);
  document.querySelector('#confirm-modal').onclick = async () => { closeModal(); try { await callback(); } catch(error) { toast(error.message,'error'); } };
}
export function promptModal(title, label, value, callback) {
  modal(title, `<label class="field">${esc(label)}<input id="prompt-value" value="${esc(value)}" autocomplete="off" /></label><p class="field-error" id="prompt-error"></p>`, `<button class="button secondary" data-action="close-modal">취소</button><button class="button primary" id="confirm-prompt">확인</button>`);
  const input = document.querySelector('#prompt-value'); input.focus(); input.select();
  const submit = async () => { try { await callback(input.value.trim()); closeModal(); } catch (error) { document.querySelector('#prompt-error').textContent = error.message; } };
  document.querySelector('#confirm-prompt').onclick = submit;
  input.onkeydown = event => { if (event.key === 'Enter') submit(); };
}
export function titlebar() {
  return `<div class="titlebar"><span>learncode</span><div class="window-controls"><button data-window="minimize" aria-label="최소화">${icon('minus')}</button><button data-window="maximize" aria-label="최대화 또는 복원">${icon('square')}</button><button class="window-close" data-window="close" aria-label="앱 닫기">${icon('x')}</button></div></div>`;
}
export function shell(content, active = 'home', extra = '') { return `${titlebar()}<div class="workspace ${extra}"><main class="main-content">${content}</main></div>`; }
export function themeButton(theme) { return `<button class="icon-button theme-toggle" data-action="theme" title="${theme === 'light' ? '다크' : '라이트'} 테마로 전환" aria-label="${theme === 'light' ? '다크' : '라이트'} 테마로 전환">${icon(theme === 'light' ? 'moon' : 'sun')}</button>`; }
