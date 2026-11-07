// @vitest-environment jsdom
// D42 (owner request 2026-11-07): learner branches. The list comes from the database in DDTC's order
// (never from the code) and is read once per session, again after a failure. The Branch field shows
// a skeleton while loading, an error with Retry, the phone's own picker below 640 px and the shadcn
// Select from tablet width up. The profile form saves a learner's branch with their other details,
// Save changes is enabled only once something has changed, and lecturers and administrators have no
// branch. The chip never shows the icon alone.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchChip } from '@/components/branches/BranchChip.jsx';
import { BranchField } from '@/components/branches/BranchField.jsx';
import { branchChoices, branchLabel, clearBranches, fetchBranches } from '@/lib/branches.js';
import { DetailsForm } from '@/pages/account/ProfilePage.jsx';

const BRANCHES = [
  { id: 'b1', name: 'Kasoa C.P', position: 1, is_active: true },
  { id: 'b2', name: 'Affumkrom - Nsawam', position: 2, is_active: true },
  { id: 'b3', name: 'Sampa', position: 3, is_active: true },
  { id: 'b4', name: 'Amanfrom', position: 4, is_active: true },
  { id: 'b5', name: 'Kumasi', position: 5, is_active: true },
  { id: 'b6', name: 'Atwitwiriso', position: 6, is_active: true },
  { id: 'b9', name: 'Closed branch', position: 99, is_active: false },
];
const OPEN_NAMES = ['Kasoa C.P', 'Affumkrom - Nsawam', 'Sampa', 'Amanfrom', 'Kumasi', 'Atwitwiriso'];

const db = vi.hoisted(() => ({ branches: vi.fn(), update: vi.fn() }));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
const auth = vi.hoisted(() => ({ value: /** @type {any} */ (null) }));

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: (/** @type {string} */ table) =>
      table === 'branches'
        ? { select: () => ({ order: () => db.branches() }) }
        : { update: (/** @type {unknown} */ payload) => ({ eq: (/** @type {string} */ column, /** @type {string} */ value) => db.update(payload, column, value) }) },
  }),
}));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/components/auth/AuthProvider.jsx', () => ({ useAuth: () => auth.value }));

/** @param {number} width */
function setWidth(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

/** @param {Partial<{ role: string, branch_id: string | null }>} [overrides] */
function signedIn(overrides = {}) {
  auth.value = {
    profile: { id: 'u1', first_name: 'Kwame', second_name: 'Mensah', email: 'kwame@example.test', contact_number: null, role: 'LEARNER', branch_id: null, ...overrides },
    refresh: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  clearBranches();
  db.branches.mockReset().mockResolvedValue({ data: BRANCHES, error: null });
  db.update.mockReset().mockResolvedValue({ error: null });
  toast.show.mockReset();
  setWidth(1024);
});
afterEach(() => setWidth(1024));

describe('the list of branches', () => {
  it('offers the open branches in order, and keeps a learner\'s own branch if it has closed since', () => {
    expect(branchChoices(BRANCHES, null).map((b) => b.name)).toEqual(OPEN_NAMES);
    expect(branchChoices(BRANCHES, 'b9').map((b) => b.name)).toEqual([...OPEN_NAMES, 'Closed branch']);
    expect(branchLabel(BRANCHES[6])).toBe('Closed branch (closed)');
    expect(branchLabel(BRANCHES[4])).toBe('Kumasi');
  });

  it('is read once per session, and read again after a failure', async () => {
    db.branches.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(fetchBranches()).rejects.toEqual({ message: 'offline' });
    await expect(fetchBranches()).resolves.toHaveLength(7);
    await fetchBranches();
    expect(db.branches).toHaveBeenCalledTimes(2);
  });
});

describe('the Branch field', () => {
  it('shows a skeleton while loading, then the phone\'s own picker below 640 px', async () => {
    setWidth(375);
    const onChange = vi.fn();
    render(<BranchField value="" onChange={onChange} hint="Your lecturers and administrators can see your branch." />);
    expect(screen.getByTestId('branch-skeleton')).toBeInTheDocument();
    const select = await screen.findByLabelText('Branch');
    expect(select.tagName).toBe('SELECT');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Select your branch', ...OPEN_NAMES]);
    expect(options[0]).toBeDisabled();
    expect(select).toHaveAccessibleDescription('Your lecturers and administrators can see your branch.');
    fireEvent.change(select, { target: { value: 'b5' } });
    expect(onChange).toHaveBeenCalledWith('b5');
  });

  it('uses the shadcn Select from tablet width up, with the placeholder', async () => {
    render(<BranchField value="" onChange={vi.fn()} />);
    const trigger = await screen.findByRole('combobox', { name: 'Branch' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveTextContent('Select your branch');
  });

  it('shows the chosen branch', async () => {
    render(<BranchField value="b2" onChange={vi.fn()} currentId="b2" />);
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('Affumkrom - Nsawam');
  });

  it('says when the branches cannot be loaded, and Retry loads them', async () => {
    db.branches.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    render(<BranchField value="" onChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The branches could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the profile form', () => {
  it('enables Save changes only once something has changed', async () => {
    signedIn();
    render(<DetailsForm />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Kwame Jnr' } });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Kwame' } });
    expect(save).toBeDisabled();
    await screen.findByRole('combobox', { name: 'Branch' });
  });

  it('saves a learner\'s branch with their other details', async () => {
    setWidth(375);
    signedIn();
    render(<DetailsForm />);
    expect(screen.getByText('Your lecturers and administrators can see your branch.')).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Branch'), { target: { value: 'b5' } });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeEnabled();
    await act(async () => fireEvent.click(save));
    expect(db.update).toHaveBeenCalledWith({ first_name: 'Kwame', second_name: 'Mensah', contact_number: null, branch_id: 'b5' }, 'id', 'u1');
    expect(auth.value.refresh).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('profile.saved');
  });

  it('shows a refused branch at the field, not as a failure toast', async () => {
    setWidth(375);
    signedIn({ branch_id: 'b1' });
    db.update.mockResolvedValueOnce({ error: { code: '22023', message: 'Choose one of the branches' } });
    render(<DetailsForm />);
    fireEvent.change(await screen.findByLabelText('Branch'), { target: { value: 'b3' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(screen.getByText('Choose one of the branches')).toBeInTheDocument();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('has no branch for lecturers and administrators', async () => {
    signedIn({ role: 'LECTURER' });
    render(<DetailsForm />);
    expect(screen.queryByText('Branch')).toBeNull();
    fireEvent.change(screen.getByLabelText('Second name'), { target: { value: 'Boateng' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(db.update).toHaveBeenCalledWith({ first_name: 'Kwame', second_name: 'Boateng', contact_number: null }, 'id', 'u1');
    expect(db.branches).not.toHaveBeenCalled();
  });
});

describe('the branch chip', () => {
  it('shows the pin with the name, never the icon alone', () => {
    const { container } = render(<BranchChip name="Kumasi" />);
    expect(container).toHaveTextContent('Branch: Kumasi');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('says "No branch" when none is set', () => {
    const { container } = render(<BranchChip name={null} />);
    expect(container).toHaveTextContent('Branch: No branch');
    expect(container.querySelector('svg')).toBeNull();
  });
});
