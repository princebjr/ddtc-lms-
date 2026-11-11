// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Owner request of 2026-11-11 (ADR-020 item 7): what an administrator sets on Settings is what the
// screens use. The limits come from client_settings(); nothing is fixed in the screens.

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({ rpc: api.rpc }) }));

const { clearClientSettings, lengthText, limitFor, limitText, loadClientSettings, recordingLimits, sizeText, tooLarge, useClientSettings } = await import(
  '@/lib/settings/client-settings.js'
);

const MB = 1024 * 1024;
/** @param {number} photoMb */
const settings = (photoMb) => ({
  file_limits: {
    profile_image: { max_bytes: photoMb * MB },
    submission_audio: { max_bytes: 25 * MB, max_seconds: 600 },
    lesson_audio: { max_bytes: 100 * MB, max_seconds: 5400 },
  },
  pass_mark: 50,
  require_course_approval: true,
});

function Probe() {
  const s = useClientSettings();
  const limit = limitFor(s, 'profile_image');
  return <p>{limit.maxBytes ? limitText(limit) : 'unknown'}</p>;
}

beforeEach(() => {
  clearClientSettings();
  api.rpc.mockReset();
});

describe('limits in words', () => {
  it('writes sizes and lengths plainly', () => {
    expect(sizeText(2 * MB)).toBe('2 MB');
    expect(sizeText(2.5 * MB)).toBe('2.5 MB');
    expect(sizeText(500 * 1024)).toBe('500 KB');
    expect(lengthText(600)).toBe('10 minutes');
    expect(lengthText(60)).toBe('1 minute');
    expect(lengthText(45)).toBe('45 seconds');
    expect(limitText({ maxBytes: 25 * MB, maxSeconds: 600 })).toBe('up to 25 MB and 10 minutes');
    expect(limitText({ maxBytes: null, maxSeconds: null })).toBe('');
  });

  it('checks a file against the setting, and leaves it to the server while unknown', () => {
    const five = limitFor(settings(5), 'profile_image');
    expect(tooLarge({ size: 4 * MB }, five)).toBeNull();
    expect(tooLarge({ size: 6 * MB }, five)).toBe('The file is larger than 5 MB.');
    expect(tooLarge({ size: 6 * MB }, limitFor(null, 'profile_image'))).toBeNull();
  });

  it('gives the recorder the setting, capped where a decision caps it', () => {
    const fallback = { maxSeconds: 600, maxBytes: 25 * MB };
    expect(recordingLimits(null, 'submission_audio', fallback)).toEqual(fallback);
    const longer = { ...settings(2), file_limits: { submission_audio: { max_bytes: 40 * MB, max_seconds: 1200 } } };
    expect(recordingLimits(longer, 'submission_audio', fallback)).toEqual({ maxSeconds: 1200, maxBytes: 40 * MB });
    // Lesson recordings stop at 30 minutes (ADR-007) even though uploads may be 90 minutes.
    expect(recordingLimits(settings(2), 'lesson_audio', { maxSeconds: 1800, maxBytes: 100 * MB }, 1800).maxSeconds).toBe(1800);
    const shorter = { ...settings(2), file_limits: { lesson_audio: { max_bytes: 100 * MB, max_seconds: 900 } } };
    expect(recordingLimits(shorter, 'lesson_audio', { maxSeconds: 1800, maxBytes: 100 * MB }, 1800).maxSeconds).toBe(900);
  });
});

describe('useClientSettings', () => {
  it('shows the limit the administrator set, and follows a change', async () => {
    api.rpc.mockResolvedValue({ data: settings(2), error: null });
    render(<Probe />);
    expect(await screen.findByText('up to 2 MB')).toBeInTheDocument();
    expect(api.rpc).toHaveBeenCalledWith('client_settings');

    api.rpc.mockResolvedValue({ data: settings(5), error: null });
    await act(async () => {
      await loadClientSettings({ force: true });
    });
    expect(screen.getByText('up to 5 MB')).toBeInTheDocument();
  });

  it('asks once while fresh, and keeps the last answer if a later read fails', async () => {
    api.rpc.mockResolvedValue({ data: settings(5), error: null });
    await loadClientSettings();
    await loadClientSettings();
    expect(api.rpc).toHaveBeenCalledTimes(1);
    api.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(limitFor(await loadClientSettings({ force: true }), 'profile_image').maxBytes).toBe(5 * MB);
  });

  it('stays unknown when the settings cannot be read', async () => {
    api.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    render(<Probe />);
    await waitFor(() => expect(api.rpc).toHaveBeenCalled());
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});
