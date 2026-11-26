'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { logEntry, pageNoteEntry } from '@/lib/data/logic';
import { isCalendarDate } from '@/lib/dates';
import { requireFactory } from '@/lib/factory/auth';
import { notifyFactoryMove } from '@/lib/factory/notify';
import {
  FACTORY_STEP_LABEL, factoryStateOf, FACTORY_ACTIONS, isFactoryJob, isFactoryStep, planStepChange,
} from '@/lib/factory/steps';
import { NOTE_MAX_PER_SHEET, cleanNoteInput, type PageNote } from '@/lib/page-notes';
import { notifyNewNote } from '@/lib/note-notify';

/**
 * Everything the factory can DO. Each action:
 *   1. checks the factory passcode's cookie again (the proxy guards pages; an
 *      action can be POSTed to directly);
 *   2. loads the order and refuses unless it's a job the factory may see;
 *   3. appends to the history — never writes the order row. What the factory
 *      does can't overwrite a field of Keenan's or collide with his autosave.
 */

type Result = { ok: true } | { ok: false; error: string };

async function jobFor(orderId: string) {
  const order = await repo.getOrderRow(String(orderId ?? ''));
  return order && isFactoryJob(order) ? order : null;
}

const NOT_A_JOB = "That job isn't on your dashboard any more. Go back to the list.";

export async function setFactoryStep(orderId: string, step: string, trackingRaw = ''): Promise<Result> {
  const actor = await requireFactory();
  if (!isFactoryStep(step)) return { ok: false, error: 'Unknown step.' };
  const order = await jobFor(orderId);
  if (!order) return { ok: false, error: NOT_A_JOB };

  const state = factoryStateOf(await repo.historyByActions([order.id], FACTORY_ACTIONS));
  const plan = planStepChange(state, step);
  if (plan.kind === 'none') return { ok: false, error: plan.reason };

  const tracking = step === 'shipped' ? String(trackingRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const label = FACTORY_STEP_LABEL[step];

  if (plan.kind === 'request') {
    await repo.appendLog([
      logEntry({
        orderId: order.id,
        action: 'factory_step_requested',
        field: 'factoryStep',
        // The tracking number rides with the request and is written to the order only on approval.
        fromValue: tracking,
        toValue: step,
        summary: `Factory marked ${label}${tracking ? ` (tracking ${tracking})` : ''} — waiting for approval`,
        actorEmail: '',
        actorName: actor.name,
      }),
    ]);
    await notifyFactoryMove(order.id, order.teamName, `${actor.name} marked it ${label}${tracking ? `, tracking ${tracking}` : ''}`, true);
  } else {
    await repo.appendLog([
      logEntry({
        orderId: order.id,
        action: 'factory_step',
        field: 'factoryStep',
        fromValue: state.step,
        toValue: step,
        summary: `Factory moved the job to ${label}`,
        actorEmail: '',
        actorName: actor.name,
      }),
    ]);
    await notifyFactoryMove(order.id, order.teamName, `${actor.name} moved it to ${label}`, false);
  }
  revalidatePath(`/factory/jobs/${order.id}`);
  revalidatePath('/factory');
  return { ok: true };
}

export async function setFactoryFinishDate(orderId: string, dateRaw: string): Promise<Result> {
  const actor = await requireFactory();
  const order = await jobFor(orderId);
  if (!order) return { ok: false, error: NOT_A_JOB };
  const date = String(dateRaw ?? '').trim();
  if (date && !(isCalendarDate(date) && /^20\d\d-/.test(date))) return { ok: false, error: 'Pick a real date.' };

  const state = factoryStateOf(await repo.historyByActions([order.id], FACTORY_ACTIONS));
  if (state.finishDate === date) return { ok: true };
  await repo.appendLog([
    logEntry({
      orderId: order.id,
      action: 'factory_finish_date',
      field: 'factoryFinishDate',
      fromValue: state.finishDate,
      toValue: date,
      summary: date ? `Factory expects to finish ${date}` : 'Factory cleared their finish date',
      actorEmail: '',
      actorName: actor.name,
    }),
  ]);
  revalidatePath(`/factory/jobs/${order.id}`);
  revalidatePath('/factory');
  return { ok: true };
}

/** The factory opened the job: Powerplay's changes up to now are read. */
export async function markFactorySeen(orderId: string): Promise<Result> {
  const actor = await requireFactory();
  // Keenan looking at the factory's side doesn't mark anything read for them.
  if (actor.isAdmin) return { ok: true };
  const order = await jobFor(orderId);
  if (!order) return { ok: false, error: NOT_A_JOB };
  await repo.appendLog([
    logEntry({
      orderId: order.id,
      action: 'factory_seen',
      summary: 'Factory opened the job',
      actorEmail: '',
      actorName: actor.name,
    }),
  ]);
  revalidatePath('/factory');
  return { ok: true };
}

/** A note pinned on the job page (the Comment button). Same notes Keenan already reads on the order. */
export async function addFactoryJobNote(
  orderId: string,
  raw: unknown,
): Promise<{ ok: boolean; note?: PageNote; error?: string }> {
  const actor = await requireFactory();
  const order = await jobFor(orderId);
  if (!order) return { ok: false, error: NOT_A_JOB };
  const input = cleanNoteInput(raw);
  if (!input) return { ok: false, error: 'Write a note first.' };

  const existing = await repo.historyByActions([order.id], ['page_note']);
  if (existing.filter((h) => h.note?.from === 'factory').length >= NOTE_MAX_PER_SHEET) {
    return { ok: false, error: 'This job has too many notes. Ask Powerplay to archive some.' };
  }
  const entry = { ...pageNoteEntry(order, 'factory', input), actorName: `${actor.name} (factory)` };
  await repo.appendLog([entry]);
  await notifyNewNote(order.id, order.teamName, entry.note!);
  return { ok: true, note: entry.note };
}
