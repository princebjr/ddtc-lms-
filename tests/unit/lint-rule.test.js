// The no-hard-coded-design-values lint rule (CLAUDE.md section 3, DESIGN.md 17).
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from '../../eslint-rules/no-hard-coded-design-values.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2023, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-hard-coded-design-values', rule, {
  valid: [
    'const c = "rounded-lg bg-card text-ink border-hairline p-4 sm:p-6";',
    'const c = "size-11 h-12 text-title-1 shadow-overlay";',
    'const c = "w-(--sidebar-width) max-h-(--radix-select-content-available-height)";',
    'const c = "data-[state=open]:animate-fade-in [&_svg]:size-5 has-[>svg]:px-3";',
    'const c = "transition-[background-color,transform] before:content-[\'\']";',
    'const v = `calc(var(--bottom-nav-space) + var(--safe-bottom))`;',
    'const el = <span style={{ height: `${n}%` }} />;',
    'const el = <span style={{ maskImage: url }} />;',
    'const el = <a href="#main">Skip</a>;',
    'const el = <span style={{ width: 0 }} />;',
  ],
  invalid: [
    { code: 'const c = "text-[13px]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "w-[320px] p-4";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "bg-[#ffffff]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "rounded-[10px]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "p-[1.5rem]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "duration-[250ms]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "z-[999]";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "#2563eb";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = "rgb(0 0 0 / 0.5)";', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const c = `hover:bg-[#000]`;', errors: [{ messageId: 'hardCoded' }] },
    { code: 'const el = <div style={{ width: "320px" }} />;', errors: [{ messageId: 'styleLength' }] },
    { code: 'const el = <div style={{ padding: 12 }} />;', errors: [{ messageId: 'styleLength' }] },
    { code: 'const el = <div style={{ fontSize: "13px" }} />;', errors: [{ messageId: 'styleLength' }] },
  ],
});
