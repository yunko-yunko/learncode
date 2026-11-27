import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

export function makeEditor(parent, { value = '', language = 'python', dark = false, onChange = () => {}, onSave = () => {} } = {}) {
  const theme = new Compartment();
  const base = EditorView.theme({
    '&': { height: '100%', fontSize: language === 'python' ? '13px' : '15px' },
    '.cm-scroller': { fontFamily: language === 'python' ? '"Cascadia Code", Consolas, monospace' : '"Malgun Gothic", sans-serif', lineHeight: '1.85', overflow: 'auto' },
    '.cm-content': { padding: '20px 0', minHeight: '100%' },
    '.cm-line': { padding: '0 20px' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#83858b', paddingLeft: '8px' },
    '&.cm-focused': { outline: 'none' },
  });
  const editor = new EditorView({ parent, state: EditorState.create({ doc: value, extensions: [
    lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(), indentOnInput(), bracketMatching(), foldGutter(), highlightActiveLine(),
    language === 'python' ? python() : markdown(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([{ key: 'Mod-s', run: () => { onSave(); return true; } }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
    base, theme.of(dark ? oneDark : []), EditorView.lineWrapping,
    EditorView.updateListener.of(update => { if (update.docChanged) onChange(update.state.doc.toString()); }),
  ] }) });
  return {
    view: editor,
    get value() { return editor.state.doc.toString(); },
    setValue(value) { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }); },
    setTheme(dark) { editor.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) }); },
    insert(before, after = '', placeholder = '') {
      const selection = editor.state.selection.main;
      const selected = editor.state.sliceDoc(selection.from, selection.to) || placeholder;
      editor.dispatch({ changes: { from: selection.from, to: selection.to, insert: before + selected + after }, selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length } }); editor.focus();
    },
    destroy() { editor.destroy(); },
  };
}
