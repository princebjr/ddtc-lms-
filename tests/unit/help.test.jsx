// @vitest-environment jsdom
// Help & Support (owner request 2026-11-13, ADR-027): on the learner's and lecturer's dashboards, a card linking
// to the four sections of the Help page; the page shows Getting Started, How to Use DDTC, Frequently Asked
// Questions and Contact Support with the email and phone/WhatsApp administrators set on Settings.
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ current: /** @type {any} */ (null) }));
vi.mock('@/lib/settings/client-settings.js', () => ({ useClientSettings: () => settings.current }));

const { default: HelpPage } = await import('@/pages/help/HelpPage.jsx');
const { HelpCard } = await import('@/components/dashboard/HelpCard.jsx');
const { helpContent, telLink, whatsAppLink } = await import('@/lib/help/content.js');

beforeEach(() => {
  settings.current = { file_limits: {}, pass_mark: 50, require_course_approval: true, support: { email: '', phone: '' } };
});

describe('the Help & Support card', () => {
  it.each(/** @type {const} */ (['learner', 'lecturer']))('links a %s to each of the four sections', (role) => {
    render(
      <MemoryRouter>
        <HelpCard role={role} />
      </MemoryRouter>,
    );
    const card = screen.getByRole('region', { name: 'Help & Support' });
    const links = within(card).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Getting Started', 'How to Use DDTC', 'Frequently Asked Questions', 'Contact Support']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/${role}/help#getting-started`, `/${role}/help#how-to`, `/${role}/help#faq`, `/${role}/help#contact`]);
  });
});

describe('the Help page', () => {
  it('shows a learner the four sections with learner help', () => {
    render(<HelpPage role="learner" />);
    for (const name of ['Getting Started', 'How to Use DDTC', 'Frequently Asked Questions', 'Contact Support']) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
    }
    expect(screen.getByText('Answer an assignment')).toBeInTheDocument();
    expect(screen.getByText('Why was I signed out?')).toBeInTheDocument();
    expect(screen.queryByText('Grade answers and release grades')).toBeNull();
  });

  it('shows a lecturer lecturer help', () => {
    render(<HelpPage role="lecturer" />);
    expect(screen.getByText('Grade answers and release grades')).toBeInTheDocument();
    expect(screen.queryByText('Answer an assignment')).toBeNull();
  });

  it('every question and topic opens in place (a native details element with its own summary)', () => {
    const { container } = render(<HelpPage role="learner" />);
    const items = container.querySelectorAll('details[data-slot="help-item"]');
    const content = helpContent('learner');
    expect(items).toHaveLength(content.howTo.length + content.faq.length);
    for (const item of items) expect(item.querySelector('summary')?.textContent).toBeTruthy();
  });

  it('without a support contact set, says who to ask instead', () => {
    render(<HelpPage role="learner" />);
    const contact = screen.getByRole('region', { name: 'Contact Support' });
    expect(within(contact).getByText('For help, speak to your lecturer or a DDTC administrator.')).toBeInTheDocument();
    expect(within(contact).queryAllByRole('link')).toHaveLength(0);
  });

  it('with an email only, offers just the email', () => {
    settings.current.support = { email: 'support@ddtc.example', phone: '' };
    render(<HelpPage role="learner" />);
    const links = within(screen.getByRole('region', { name: 'Contact Support' })).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['mailto:support@ddtc.example']);
  });

  it('with an email and a phone, offers email, a call and WhatsApp (opening in a new tab)', () => {
    settings.current.support = { email: 'support@ddtc.example', phone: '+233 24 123 4567' };
    render(<HelpPage role="lecturer" />);
    const links = within(screen.getByRole('region', { name: 'Contact Support' })).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['mailto:support@ddtc.example', 'tel:+233241234567', 'https://wa.me/233241234567']);
    expect(links[2].getAttribute('target')).toBe('_blank');
    expect(links[2].getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('contact links', () => {
  it('turns a local Ghana number into an international one for WhatsApp, and keeps others as given', () => {
    expect(whatsAppLink('024 123 4567')).toBe('https://wa.me/233241234567');
    expect(whatsAppLink('+44 20 7946 0958')).toBe('https://wa.me/442079460958');
    expect(telLink('024 123 4567')).toBe('tel:0241234567');
    expect(telLink('+233 24 123 4567')).toBe('tel:+233241234567');
  });
});
