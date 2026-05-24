'use client';

import { useEffect, useRef } from 'react';

const BLOCKED_TAGS = new Set(['script', 'style', 'meta', 'link', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'poster', 'action', 'formaction', 'xlink:href']);
const SKIP_MATH_TAGS = new Set(['CODE', 'PRE', 'TEXTAREA', 'SCRIPT', 'STYLE']);

function isSafeUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return false;
  if (/^(#|\/|\.\.?\/|\?)/.test(trimmed) || /^data:image\//i.test(trimmed)) return true;

  try {
    const parsedUrl = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function sanitizeStyle(value: string) {
  return value
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => !/(expression\s*\(|url\s*\(|@import|javascript:|-moz-binding|behavior\s*:)/i.test(rule))
    .join('; ');
}

function sanitizeHtml(value: string) {
  if (typeof DOMParser === 'undefined') return value;

  const document = new DOMParser().parseFromString(value || '', 'text/html');

  Array.from(document.body.querySelectorAll('*')).forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tagName)) {
      element.remove();
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim();

      if (attributeName.startsWith('on') || attributeName === 'srcdoc') {
        element.removeAttribute(attribute.name);
        return;
      }

      if (URL_ATTRIBUTES.has(attributeName) && !isSafeUrl(attributeValue)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (attributeName === 'style') {
        const safeStyle = sanitizeStyle(attributeValue);
        if (safeStyle) element.setAttribute(attribute.name, safeStyle);
        else element.removeAttribute(attribute.name);
      }
    });
  });

  return document.body.innerHTML;
}

function normalizeLatex(value: string) {
  return value
    .replace(/\\;/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\_/g, '_')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq?/g, '≠')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\to/g, '→')
    .replace(/\\infty/g, '∞')
    .replace(/\\ldots/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitMathSegments(value: string) {
  const segments: { type: 'text' | 'inlineMath' | 'displayMath'; value: string }[] = [];
  const pattern = /(^|[^\\])(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const raw = match[2];
    const rawStartIndex = match.index + match[1].length;

    if (rawStartIndex > lastIndex) segments.push({ type: 'text', value: value.slice(lastIndex, rawStartIndex) });

    const display = raw.startsWith('$$') || raw.startsWith('\\[');
    const expression = raw.startsWith('$$') ? raw.slice(2, -2) : raw.startsWith('$') ? raw.slice(1, -1) : raw.slice(2, -2);
    segments.push({ type: display ? 'displayMath' : 'inlineMath', value: expression });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) segments.push({ type: 'text', value: value.slice(lastIndex) });
  return segments;
}

function enhanceLatex(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/(\$|\\\(|\\\[)/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;

      let parent = node.parentElement;
      while (parent) {
        if (SKIP_MATH_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        parent = parent.parentElement;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Node[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const segments = splitMathSegments(node.nodeValue || '');
    if (segments.length <= 1 && segments[0]?.type === 'text') return;

    const fragment = document.createDocumentFragment();
    segments.forEach((segment) => {
      if (segment.type === 'text') {
        fragment.append(document.createTextNode(segment.value));
        return;
      }

      const element = document.createElement(segment.type === 'displayMath' ? 'div' : 'span');
      element.className = segment.type === 'displayMath' ? 'rich-math rich-math-display' : 'rich-math rich-math-inline';
      element.title = segment.value;
      element.textContent = normalizeLatex(segment.value);
      fragment.append(element);
    });

    node.parentNode?.replaceChild(fragment, node);
  });
}

export function RichProblemContent({ html, className = '' }: { readonly html: string; readonly className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = sanitizeHtml(html);
    enhanceLatex(container);
  }, [html]);

  return <div ref={containerRef} className={`rich-problem-content ${className}`} />;
}
