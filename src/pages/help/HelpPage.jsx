import { BookOpen, ChevronRight, CircleHelp, LifeBuoy, Mail, MessageCircle, Phone, Rocket } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { HELP_SECTIONS, helpContent, telLink, whatsAppLink } from '@/lib/help/content.js';
import { useClientSettings } from '@/lib/settings/client-settings.js';

// Help & Support (owner request 2026-11-13, ADR-027): for learners and lecturers. Getting Started, How to Use
// DDTC and Frequently Asked Questions (src/lib/help/content.js), then Contact Support with the email and the
// phone/WhatsApp number administrators set on Settings. Each section has an anchor the dashboard card links to.

const ICONS = { 'getting-started': Rocket, 'how-to': BookOpen, faq: CircleHelp, contact: LifeBuoy };

/** @param {{ role: 'learner' | 'lecturer' }} props */
export default function HelpPage({ role }) {
  const content = helpContent(role);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help & Support" description={content.intro} />
      <nav aria-label="Help sections">
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {HELP_SECTIONS.map((s) => {
            const Icon = ICONS[s.id];
            return (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-hairline bg-card px-4 py-2 text-ink hover:bg-fill focus-visible:focus-ring">
                  <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-label">{s.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <Section id="getting-started" title="Getting Started">
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {content.gettingStarted.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-label text-on-primary" aria-hidden="true">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-label text-ink">{step.title}</span>
                <span className="text-body-sm text-ink-secondary">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="how-to" title="How to Use DDTC">
        <div className="flex flex-col gap-2">
          {content.howTo.map((h) => (
            <Expandable key={h.title} title={h.title}>
              <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink">
                {h.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Expandable>
          ))}
        </div>
      </Section>

      <Section id="faq" title="Frequently Asked Questions">
        <div className="flex flex-col gap-2">
          {content.faq.map((f) => (
            <Expandable key={f.question} title={f.question}>
              <p className="m-0 text-body-sm text-ink">{f.answer}</p>
            </Expandable>
          ))}
        </div>
      </Section>

      <Section id="contact" title="Contact Support">
        <Contact />
      </Section>
    </div>
  );
}

/** @param {{ id: string, title: string, children: import('react').ReactNode }} props */
function Section({ id, title, children }) {
  return (
    <Card as="section" id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-20 flex-col gap-4">
      <CardTitle id={`${id}-heading`}>
        {title}
      </CardTitle>
      {children}
    </Card>
  );
}

/** A question or topic that opens in place (native details: keyboard and screen readers work without script). */
/** @param {{ title: string, children: import('react').ReactNode }} props */
function Expandable({ title, children }) {
  return (
    <details className="group rounded-lg border border-hairline bg-card" data-slot="help-item">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-label text-ink focus-visible:focus-ring">
        <ChevronRight className="size-4 shrink-0 text-ink-secondary transition-transform duration-fast group-open:rotate-90" aria-hidden="true" />
        <span className="min-w-0 flex-1">{title}</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Contact() {
  const settings = useClientSettings();
  const email = settings?.support?.email ?? '';
  const phone = settings?.support?.phone ?? '';
  if (!settings) return <CardDescription>Loading the support contact…</CardDescription>;
  if (!email && !phone) {
    return <CardDescription>For help, speak to your lecturer or a DDTC administrator.</CardDescription>;
  }
  return (
    <div className="flex flex-col gap-3">
      <CardDescription>Contact DDTC support. Tap to open your email, phone or WhatsApp.</CardDescription>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
        {email ? (
          <ContactLink href={`mailto:${email}`} icon={Mail} label="Email" value={email} />
        ) : null}
        {phone ? <ContactLink href={telLink(phone)} icon={Phone} label="Call" value={phone} /> : null}
        {phone ? <ContactLink href={whatsAppLink(phone)} icon={MessageCircle} label="WhatsApp" value={phone} external /> : null}
      </ul>
    </div>
  );
}

/** @param {{ href: string, icon: import('lucide-react').LucideIcon, label: string, value: string, external?: boolean }} props */
function ContactLink({ href, icon: Icon, label, value, external = false }) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="flex min-h-14 items-center gap-3 rounded-lg border border-hairline bg-card px-4 py-2 text-ink hover:bg-fill focus-visible:focus-ring"
      >
        <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="text-label">{label}</span>
          <span className="break-all text-body-sm text-ink-secondary">{value}</span>
        </span>
      </a>
    </li>
  );
}
