/**
 * Who is inside the purchase, as pure functions.
 *
 * These lived inline in server.ts, which calls `app.listen` at import: a test
 * that wanted to assert "an unpaid student cannot reach the tutor" had to boot
 * Fastify, Postgres and the ai service first, so nobody wrote one. Same trade as
 * chat-brake.ts.
 *
 * TWO GATES, NOT ONE, and the difference is the whole point:
 *
 *   paidAccess(u)      is this person inside the purchase at all
 *   lessonAccess(u, n) may this person open lesson n
 *
 * A lesson has a free tier — lesson 01 and its three labs — so `lessonAccess`
 * says yes to a free account for n <= FREE_LESSONS. The AI tutor has no free
 * tier: the upgrade notice sells it by name ("el tutor de IA" / "the AI tutor",
 * web/src/lib/i18n.ts upB), and the landing promises exactly one free thing, the
 * first lesson. Anything that is not a lesson asks `paidAccess`.
 *
 * Tutors, admins and root are never students of their own product; accompanying
 * is their job and they pay nothing to do it.
 */

/** Lesson 01 and its three labs. The only thing the offer gives away. */
export const FREE_LESSONS = 1;

export interface Payer {
  paid: unknown;
  role: string;
}

/** Inside the purchase: a paying student, or anyone who is not a student. */
export const paidAccess = (u: Payer): boolean => !!u.paid || u.role !== 'student';

/** May open lesson `n`. Free accounts get lessons up to FREE_LESSONS. */
export const lessonAccess = (u: Payer, n: unknown): boolean =>
  paidAccess(u) || Number(n) <= FREE_LESSONS;
