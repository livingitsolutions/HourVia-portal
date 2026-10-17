import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { identityNavigation } from './IdentityPages';
describe('public identity demonstrations', () => {
  it.each(identityNavigation)('renders $label through existing routing with authentication disabled', ({ to, label }) => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [to] }, createElement(App)));
    expect(html).toContain(`<h1>${label}`);
    expect(html).toContain('Demonstration only.');
    expect(html).toContain('Authentication is disabled.');
    expect(html).toContain('Monitoring is OFF.');
    expect(html).toContain('Use dark theme');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('This page is off the clock');
  });
  it('retains the dashboard route', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/app'] }, createElement(App)));
    expect(html).toContain('Organization overview'); expect(html).toContain('Loading overview');
  });
});
