import { test } from "node:test";
import assert from "node:assert/strict";
import { textToSign } from "../src/services/gloss.js";

const VOCAB = ["hello", "thank_you", "good_morning"];

test("multi-word signs match longest first", () => {
  const t = textToSign("Thank you, good morning!", VOCAB);
  assert.deepEqual(t.map(x => x.label), ["thank_you", "good_morning"]);
});

test("gloss drops articles and fingerspells unknown words", () => {
  const t = textToSign("hello the cat", VOCAB);
  assert.equal(t.length, 2);
  assert.equal(t[1].type, "fingerspell");
  assert.deepEqual(t[1].letters, ["c", "a", "t"]);
});

test("gloss can be disabled", () => {
  assert.equal(textToSign("the", VOCAB, { gloss: false }).length, 1);
});

test("plurals use the singular sign; 'good morning' still beats 'good'", () => {
  const t = textToSign("Good morning doctors, bus", [...VOCAB, "doctor", "good", "bu"]);
  assert.deepEqual(t.map(x => x.label ?? x.type), ["good_morning", "doctor", "fingerspell"]);
});

test("plural rule never turns a short word into a different sign", () => {
  assert.equal(textToSign("news", ["new"])[0].type, "fingerspell");
  assert.equal(textToSign("glass", ["glas"])[0].type, "fingerspell");
});
