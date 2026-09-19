/**
 * The two gates, and the difference between them.
 *
 * This is a pure test on purpose: the same predicates used to live inside
 * server.ts, which calls app.listen at import, so asserting "a free account
 * cannot reach the tutor" meant booting Fastify, Postgres and the ai service.
 * Nobody did, and the tutor was free for months.
 */
import assert from 'node:assert/strict';
import { FREE_LESSONS, paidAccess, lessonAccess } from '../src/paywall.ts';

const student = (paid: unknown) => ({ paid, role: 'student' });

// 1. The purchase gate. This is the one the AI tutor asks.
{
  assert.equal(paidAccess(student(true)), true, 'a paying student is inside');
  assert.equal(paidAccess(student(1)), true, 'paid arrives from Postgres as 1, not true');
  assert.equal(paidAccess(student(false)), false, 'a free student is outside');
  assert.equal(paidAccess(student(0)), false, 'and 0 is outside too');
  assert.equal(paidAccess(student(null)), false, 'null is outside: a missing row is not a purchase');
  assert.equal(paidAccess(student(undefined)), false, 'undefined is outside');
  assert.equal(paidAccess(student('')), false, 'the empty string is outside');
}

// 2. Staff are never students of their own product.
{
  for (const role of ['tutor', 'admin', 'root']) {
    assert.equal(paidAccess({ paid: false, role }), true, `${role} does not buy the course to do their job`);
    assert.equal(lessonAccess({ paid: false, role }, 12), true, `${role} opens any lesson`);
  }
}

// 3. The lesson gate keeps its free tier, and it is exactly one lesson.
{
  assert.equal(FREE_LESSONS, 1, 'the offer promises ONE free lesson; changing this changes the landing copy');
  assert.equal(lessonAccess(student(false), 1), true, 'lesson 01 is the shop window');
  assert.equal(lessonAccess(student(false), 2), false, 'lesson 02 is not');
  assert.equal(lessonAccess(student(false), 12), false, 'nor is the last one');
  assert.equal(lessonAccess(student(true), 12), true, 'a buyer opens all twelve');
}

// 4. The gates are NOT the same function, and this is the regression that
//    matters: reusing lessonAccess for the tutor would have let a free account
//    through, because `Number(undefined) <= 1` is false but `Number(null)` is 0.
{
  assert.equal(lessonAccess(student(false), null), true, 'null reads as lesson 0, which is under the free ceiling');
  assert.equal(paidAccess(student(false)), false, 'the tutor gate has no ceiling to slip under');
  assert.notEqual(
    lessonAccess(student(false), null),
    paidAccess(student(false)),
    'asking the lesson gate about something that is not a lesson answers yes',
  );
}

// 5. A garbage lesson number must not open anything.
{
  assert.equal(lessonAccess(student(false), 'dos'), false, 'NaN <= 1 is false, so a non-number stays shut');
  assert.equal(lessonAccess(student(false), {}), false);
  assert.equal(lessonAccess(student(false), [3]), false, 'Number([3]) is 3');
}

console.log('paywall: the tutor asks paidAccess, the lesson asks lessonAccess, and they answer differently');
