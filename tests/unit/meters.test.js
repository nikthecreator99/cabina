import test from 'node:test';
import assert from 'node:assert/strict';
import { newMeters, regeneration, meterIssues } from '../../js/meters.js';

test('Показания обеих секций складываются, пустое значение не считается нулём', () => {
  const m = newMeters('2эс5к', []);
  assert.equal(m.sections.length, 2);
  m.sections = [{ regenFrom: '52350', regenTo: '52550' }, { regenFrom: '50200', regenTo: '50400' }];
  assert.equal(regeneration([{ meters: m }]), 400);
  const t = { legs: [{ meters: { mode: 'electric', sections: [{ regenFrom: '0' }] } }] };
  assert.equal(meterIssues(t).length, 1);
  assert.equal(regeneration([t]), null);
  t.legs[0].meters.sections[0].regenTo = '0';
  assert.equal(regeneration([t]), 0);
  assert.equal(meterIssues(t).length, 0);
});
test('Для следующей поездки запоминается только конфигурация серии', () => {
  const m = newMeters('ЧМЭ3', []);
  assert.deepEqual(m, { mode: 'diesel', sections: [{}] });
  const trip = { legs: [{ locoType: '3-ЭС5К', meters: { mode: 'traction', sections: [{ energyFrom: '25' }, {}, {}] } }] };
  assert.deepEqual(newMeters('3эс5к', [trip]), { mode: 'traction', sections: [{}, {}, {}] });
});
