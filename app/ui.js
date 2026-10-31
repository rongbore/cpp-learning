import {fmt} from './analysis.js';
export const $ = id => document.getElementById(id);
export function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
export function fillSelect(node, entries, placeholder) {
  const old = node.value;
  node.replaceChildren(...(placeholder ? [new Option(...placeholder)] : []), ...entries.map(([label,value]) => new Option(label,value)));
  if ([...node.options].some(o => o.value === old)) node.value = old;
}
export function bar(label, value, count, kind = 'class-color') {
  const root = el('div', undefined, 'bar-row');
  const heading = el('div', undefined, 'bar-caption');
  heading.append(el('span', label), el('span', `${value === null ? '无证据' : fmt(value) + ' / 100'}${count !== undefined ? ' · n=' + count : ''}`));
  const track = el('div', undefined, 'bar-track');
  if (value !== null) {const fill = el('div', undefined, 'bar-fill ' + kind);fill.style.width = Math.max(0, Math.min(100, value)) + '%';track.append(fill);}
  track.setAttribute('role', 'img');track.setAttribute('aria-label',heading.textContent);
  root.append(heading,track);return root;
}
export function badge(status) {
  return el('span',status,'pill '+(status==='优先补强'?'warn':['达到目标','拓展提升'].includes(status)?'good':''));
}
export function download(name, text, type='text/csv;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
