import { ReportLessonProblemDialog } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ReportLessonProblemDialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const VERSION = '2026-11-01T10:00:00.123Z';
const REPORT_URL =
  '/api/v1/plans/plan-1/modules/module-1/tasks/task-1/problem-report';

async function openDialog() {
  const user = userEvent.setup();
  render(
    <ReportLessonProblemDialog
      planId='plan-1'
      moduleId='module-1'
      taskId='task-1'
      lessonTitle='Understand state'
      lessonContentUpdatedAt={VERSION}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Report a problem' }));
  return user;
}

function sendButton() {
  return screen.getByRole('button', { name: 'Send report' });
}

function noteBox() {
  return screen.getByRole('textbox', { name: /details/i });
}

function refusal(status: number, body: Record<string, unknown>) {
  vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));
}

describe('ReportLessonProblemDialog', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('opens empty with focus on the first reason', async () => {
    await openDialog();

    expect(
      screen.getByRole('dialog', { name: 'Report a problem' }),
    ).toHaveAccessibleDescription(/“Understand state”/);
    const first = screen.getByRole('radio', { name: /incorrect/i });
    await waitFor(() => expect(first).toHaveFocus());
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText('0/1,000 characters')).toBeInTheDocument();
  });

  it('sends nothing without a reason and points at the reasons', async () => {
    const user = await openDialog();

    await user.click(sendButton());

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a reason.')).toBeInTheDocument();
    const first = screen.getByRole('radio', { name: /incorrect/i });
    expect(first).toHaveFocus();
    expect(
      screen.getByRole('radiogroup', { name: "What's the problem?" }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAccessibleDescription('Choose a reason.');

    await user.click(screen.getByRole('radio', { name: /unclear/i }));
    expect(screen.queryByText('Choose a reason.')).not.toBeInTheDocument();
  });

  it('sends the reason, trimmed note and lesson version, then confirms and closes', async () => {
    refusal(200, { id: 'report-1' });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /broken source/i }));
    await user.type(noteBox(), '  The second link 404s  ');
    await user.click(sendButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Report received. Thanks for letting us know.',
      ),
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(REPORT_URL);
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      reason: 'broken_source',
      note: 'The second link 404s',
      lessonContentUpdatedAt: VERSION,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts a server note-length refusal on the note', async () => {
    refusal(400, {
      error: 'Invalid lesson problem report.',
      code: 'VALIDATION_ERROR',
      details: { field: 'note' },
    });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /other/i }));
    await user.type(noteBox(), 'Too long, says the server');
    await user.click(sendButton());

    const message = 'Keep your details to 1,000 characters or fewer.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(noteBox()).toHaveFocus();
    expect(noteBox()).toHaveAttribute('aria-invalid', 'true');
    expect(noteBox()).toHaveAccessibleDescription(
      `25/1,000 characters ${message}`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'PLAN_ENTITLEMENT_REQUIRED'],
    [404, 'NOT_FOUND'],
  ])('shows the access copy on %i', async (status, code) => {
    refusal(status, { error: 'Nope.', code });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This lesson is unavailable or you do not have access to it.',
    );
  });

  it('asks for a refresh when the lesson changed since it was opened', async () => {
    refusal(409, { error: 'Changed.', code: 'LESSON_CONTENT_CHANGED' });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This lesson changed since you opened it. Refresh the page and try again.',
    );
  });

  it('shows the rate-limit copy on 429', async () => {
    refusal(429, { error: 'Too Many Requests', code: 'RATE_LIMITED' });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Wait a moment and try again.',
    );
  });

  it('shows the known-failure copy on a server error and focuses Send again', async () => {
    refusal(500, { error: 'Internal Server Error', code: 'INTERNAL_ERROR' });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send your report. Try again.',
    );
    expect(sendButton()).toHaveFocus();
    expect(sendButton()).not.toHaveAttribute('aria-disabled');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps the form when the outcome is unknown', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /unclear/i }));
    await user.type(noteBox(), 'Step 3 skips setup');
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm that your report was sent. Try again.',
    );
    expect(screen.getByRole('radio', { name: /unclear/i })).toBeChecked();
    expect(noteBox()).toHaveValue('Step 3 skips setup');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('marks Send busy and ignores repeat submits while sending', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.click(sendButton());

    expect(sendButton()).toHaveAttribute('aria-busy', 'true');
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(noteBox()).toBeDisabled();
    await user.click(sendButton());
    await user.keyboard('{Escape}');
    expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    resolve(Response.json({ id: 'report-1' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('opens empty again after a report was sent', async () => {
    refusal(200, { id: 'report-1' });
    const user = await openDialog();

    await user.click(screen.getByRole('radio', { name: /incorrect/i }));
    await user.type(noteBox(), 'Wrong date');
    await user.click(sendButton());
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Report a problem' }));
    expect(screen.getByRole('radio', { name: /incorrect/i })).not.toBeChecked();
    expect(noteBox()).toHaveValue('');
  });
});
