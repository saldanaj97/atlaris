import {
  fromSerializableReservation,
  resolvePlanGenerationWorkflowPurpose,
  toSerializableReservation,
} from '@/features/plans/workflows/plan-generation.types';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { describe, expect, it } from 'vitest';

describe('plan-generation workflow reservation serialization', () => {
  it('round-trips attempt reservations through serializable form', () => {
    const reservation = makeAttemptReservation({
      attemptId: 'att-123',
      attemptNumber: 2,
      promptHash: 'hash-abc',
    });

    const serialized = toSerializableReservation(reservation);
    const restored = fromSerializableReservation(serialized);

    expect(serialized).toEqual({
      attemptId: reservation.attemptId,
      attemptNumber: reservation.attemptNumber,
      startedAt: reservation.startedAt.toISOString(),
      promptHash: reservation.promptHash,
      sanitized: reservation.sanitized,
      generationPurpose: 'initial',
    });
    expect(restored).toEqual(reservation);
  });

  it('round-trips epoch and far-future startedAt values', () => {
    for (const startedAt of [
      new Date(0),
      new Date('2099-12-31T23:59:59.999Z'),
    ]) {
      const reservation = makeAttemptReservation({ startedAt });
      const restored = fromSerializableReservation(
        toSerializableReservation(reservation),
      );
      expect(restored.startedAt.getTime()).toBe(startedAt.getTime());
    }
  });

  it('throws on malformed startedAt ISO strings', () => {
    const reservation = makeAttemptReservation();
    const serialized = {
      ...toSerializableReservation(reservation),
      startedAt: 'not-a-date',
    };

    expect(() => fromSerializableReservation(serialized)).toThrow(
      'Invalid reservation.startedAt: not-a-date',
    );
  });

  it('throws on empty startedAt', () => {
    const reservation = makeAttemptReservation();
    const serialized = {
      ...toSerializableReservation(reservation),
      startedAt: '',
    };

    expect(() => fromSerializableReservation(serialized)).toThrow(
      'Invalid reservation.startedAt:',
    );
  });

  it('round-trips regeneration purpose through serializable form', () => {
    const reservation = makeAttemptReservation({
      generationPurpose: 'regeneration',
    });
    const restored = fromSerializableReservation(
      toSerializableReservation(reservation),
    );

    expect(restored.generationPurpose).toBe('regeneration');
  });

  it('resolves missing workflow payload and reservation purpose at the trusted fallback', () => {
    expect(resolvePlanGenerationWorkflowPurpose({})).toBe('initial');
    expect(
      resolvePlanGenerationWorkflowPurpose({ generationPurpose: 'initial' }),
    ).toBe('initial');

    const reservation = makeAttemptReservation();
    const serialized = toSerializableReservation(reservation);
    const restored = fromSerializableReservation({
      attemptId: serialized.attemptId,
      attemptNumber: serialized.attemptNumber,
      startedAt: serialized.startedAt,
      promptHash: serialized.promptHash,
      sanitized: serialized.sanitized,
    });

    expect(restored.generationPurpose).toBe('initial');
  });

  it('rejects explicit regeneration purpose on the plan-generation boundary', () => {
    expect(() =>
      resolvePlanGenerationWorkflowPurpose({
        generationPurpose: 'regeneration',
      }),
    ).toThrow(/Invalid generation purpose: regeneration \(expected initial\)/);
  });

  it('rejects invalid reservation purpose values', () => {
    const reservation = makeAttemptReservation();
    const serialized = {
      ...toSerializableReservation(reservation),
      generationPurpose: 'retry',
    };

    expect(() =>
      fromSerializableReservation(
        serialized as unknown as ReturnType<typeof toSerializableReservation>,
      ),
    ).toThrow(/Invalid generation purpose/);
  });
});
