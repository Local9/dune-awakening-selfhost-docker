import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDockerBytes,
  parseMemorySettingBytes,
  selectSwapMemoryDonor,
  percentAfterMemoryDonation,
  SWAP_MEMORY_CHUNK_BYTES,
  SWAP_MEMORY_DONOR_MAX_PERCENT
} from "../src/services/swapMemory.js";

test("parseDockerBytes handles binary units", () => {
  assert.equal(parseDockerBytes("1GiB"), 1024 ** 3);
  assert.equal(parseDockerBytes("512MiB"), 512 * 1024 ** 2);
});

test("parseMemorySettingBytes parses friendly memory labels", () => {
  assert.equal(parseMemorySettingBytes("8 GiB"), 8 * 1024 ** 3);
});

test("selectSwapMemoryDonor picks lowest usage donor below threshold", () => {
  const target = { container: "dune-server-survival-1", map: "Survival_1", usedBytes: 7 * 1024 ** 3, limitBytes: 8 * 1024 ** 3, percent: 95 };
  const donor = { container: "dune-server-overmap", map: "Overmap", usedBytes: 2 * 1024 ** 3, limitBytes: 8 * 1024 ** 3, percent: 25 };
  const selected = selectSwapMemoryDonor([target, donor], target);
  assert.equal(selected.container, donor.container);
});

test("percentAfterMemoryDonation reflects 1GiB donation", () => {
  const row = { usedBytes: 3 * 1024 ** 3, limitBytes: 8 * 1024 ** 3, percent: 37.5 };
  const next = percentAfterMemoryDonation(row);
  assert.ok(next > row.percent);
  assert.ok(next < 100);
  assert.equal(SWAP_MEMORY_CHUNK_BYTES, 1024 ** 3);
  assert.equal(SWAP_MEMORY_DONOR_MAX_PERCENT, 55);
});
