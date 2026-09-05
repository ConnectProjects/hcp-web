/**
 * shared/components/noc-picker.js — NOC occupation code autocomplete
 *
 * Usage:
 *   import { mountNocPicker } from '../../shared/components/noc-picker.js'
 *
 *   mountNocPicker(containerEl, {
 *     jobTitle:       'Sawmill operator',   // initial value (string)
 *     occupationCode: '9431',               // initial code (string)
 *     onChange: ({ title, code }) => { ... }
 *   })
 *
 * Renders a text input with a live-filtered dropdown. Selecting an entry
 * fills in both the human-readable title and the NOC code. Typing a custom
 * value clears the code (free text is allowed as a fallback).
 *
 * The NOC JSON is loaded once and cached for the lifetime of the page.
 */

const NOC_PATH = new URL('../../shared/wsbc-noc.json', import.meta.url).href

let _nocData   = null   // cached [code, title][] once loaded
let _loadProm  = null   // in-flight promise so concurrent callers share one fetch

async function loadNoc() {
  if (_nocData) return _nocData
  if (_loadProm) return _loadProm
  _loadProm = fetch(NOC_PATH)
    .then(r => r.json())
    .then(data => { _nocData = data; return data })
  return _loadProm
}

const MAX_RESULTS = 60

/**
 * Mount the NOC picker into containerEl.
 * Returns { getValue() } — call to read the current { title, code }.
 */
export function mountNocPicker(containerEl, { jobTitle = '', occupationCode = '', onChange } = {}) {
  let _title  = jobTitle
  let _code   = occupationCode
  let _open   = false
  let _active = -1      // keyboard-active index in the dropdown
  let _results = []

  containerEl.innerHTML = `
    <div class="noc-picker" style="position:relative">
      <input class="search-input" id="noc-input" type="text"
             value="${_esc(_title)}"
             placeholder="Type to search job titles…"
             autocomplete="off" spellcheck="false">
      ${_code ? `<span class="noc-code-badge" id="noc-code" style="
        position:absolute;right:0.5rem;top:50%;transform:translateY(-50%);
        font-size:0.75rem;color:var(--clr-subtle);pointer-events:none
      ">${_esc(_code)}</span>` : '<span id="noc-code" style="display:none"></span>'}
      <ul id="noc-list" style="
        display:none;position:absolute;z-index:200;
        background:var(--clr-surface,#fff);border:1px solid var(--clr-border,#ddd);
        border-radius:var(--radius,4px);max-height:14rem;overflow-y:auto;
        width:100%;margin:0;padding:0;list-style:none;
        box-shadow:0 4px 12px rgba(0,0,0,0.12)
      "></ul>
    </div>
  `

  const input    = containerEl.querySelector('#noc-input')
  const list     = containerEl.querySelector('#noc-list')
  const codeBadge = containerEl.querySelector('#noc-code')

  function showCode(code) {
    if (code) {
      codeBadge.textContent = code
      codeBadge.style.display = ''
    } else {
      codeBadge.textContent = ''
      codeBadge.style.display = 'none'
    }
  }

  function renderList(results) {
    _results = results
    if (!results.length) { list.style.display = 'none'; return }
    list.innerHTML = results.map(([code, title], i) =>
      `<li data-i="${i}" style="
        padding:0.35rem 0.6rem;cursor:pointer;font-size:0.875rem;
        display:flex;justify-content:space-between;gap:0.5rem;
        ${i === _active ? 'background:var(--clr-primary,#2563eb);color:#fff' : ''}
      ">
        <span>${_esc(title)}</span>
        <span style="font-size:0.75rem;opacity:0.6;white-space:nowrap">${_esc(code)}</span>
      </li>`
    ).join('')
    list.style.display = ''
    _open = true
  }

  function selectIndex(i) {
    const entry = _results[i]
    if (!entry) return
    _code  = entry[0]
    _title = entry[1]
    input.value = _title
    showCode(_code)
    list.style.display = 'none'
    _open = false
    _active = -1
    onChange?.({ title: _title, code: _code })
  }

  function close() {
    list.style.display = 'none'
    _open  = false
    _active = -1
  }

  async function search(q) {
    if (!q.trim()) { close(); return }
    const data = await loadNoc()
    const ql   = q.toLowerCase()
    const hits  = []
    for (const entry of data) {
      if (entry[1].toLowerCase().includes(ql)) {
        hits.push(entry)
        if (hits.length >= MAX_RESULTS) break
      }
    }
    renderList(hits)
  }

  // Typing
  let _debounce = null
  input.addEventListener('input', () => {
    const q = input.value
    _title  = q
    _code   = ''   // free text clears the code
    showCode('')
    onChange?.({ title: q, code: '' })
    clearTimeout(_debounce)
    _debounce = setTimeout(() => search(q), 120)
  })

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    if (!_open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      _active = Math.min(_active + 1, _results.length - 1)
      renderList(_results)
      list.children[_active]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      _active = Math.max(_active - 1, 0)
      renderList(_results)
      list.children[_active]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && _active >= 0) {
      e.preventDefault()
      selectIndex(_active)
    } else if (e.key === 'Escape') {
      close()
    }
  })

  // Click a result
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]')
    if (li) { e.preventDefault(); selectIndex(Number(li.dataset.i)) }
  })

  // Close on blur (after mousedown has a chance to fire)
  input.addEventListener('blur', () => setTimeout(close, 150))

  // Pre-warm the NOC data in the background
  loadNoc()

  return {
    getValue: () => ({ title: _title, code: _code }),
  }
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
