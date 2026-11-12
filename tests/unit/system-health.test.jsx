// @vitest-environment jsdom
// Phase 13 (ADR-023): the System health card on the administrator dashboard. The checks are pgTAP 40.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemHealth } from '@/components/dashboard/SystemHealth.jsx';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({ rpc }) }));

beforeEach(() => rpc.mockReset());

describe('System health', () => {
  it('says all is well when the check finds nothing', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<SystemHealth />);
    expect(await screen.findByText('All good')).toBeTruthy();
    expect(screen.getByText('Scheduled jobs, emails, retention and backups are working.')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('system_health');
  });

  it('lists what needs attention, errors marked as such', async () => {
    rpc.mockResolvedValue({
      data: [
        { key: 'backup_database_missing', severity: 'error', title: 'No database backup yet', message: 'No successful database backup has been recorded.' },
        { key: 'emails_failed', severity: 'warning', title: 'Emails could not be sent', message: '2 email(s) failed for good in the last 24 hours.' },
      ],
      error: null,
    });
    render(<SystemHealth />);
    expect(await screen.findByText('2 to look at')).toBeTruthy();
    expect(screen.getByText('No database backup yet')).toBeTruthy();
    expect(screen.getByText('2 email(s) failed for good in the last 24 hours.')).toBeTruthy();
  });

  it('shows nothing when it cannot be read (the dashboard still works)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const view = render(<SystemHealth />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(view.container.innerHTML).toBe('');
  });
});
