import test from 'node:test';
import assert from 'node:assert/strict';
import { newMeters, meterDelta, meterTotals, meterIssues } from '../../js/meters.js';

test('Показания обеих секций складываются, пустое значение не считается нулём', () => {
  const m = newMeters('2эс5к', []);
  assert.equal(m.sections.length, 2);
  m.sections = [{ regenFrom: '52350', regenTo: '52550' }, { regenFrom: '50200', regenTo: '50400' }];
  assert.equal(meterTotals([{ meters: m }]).regen, 400);
  const t = { legs: [{ meters: { mode: 'electric', sections: [{ regenFrom: '0' }] } }] };
  assert.equal(meterIssues(t).length, 1);
  assert.equal(meterTotals([t]).regen, null);
  t.legs[0].meters.sections[0].regenTo = '0';
  assert.equal(meterTotals([t]).regen, 0);
  assert.equal(meterIssues(t).length, 0);
});
test('Для следующей поездки запоминается только конфигурация серии', () => {
  const m = newMeters('ЧМЭ3', []);
  assert.deepEqual(m, { mode: 'diesel', sections: [{}] });
  const trip = { legs: [{ locoType: '3-ЭС5К', meters: { mode: 'traction', sections: [{ energyFrom: '25' }, {}, {}] } }] };
  assert.deepEqual(newMeters('3эс5к', [trip]), { mode: 'traction', sections: [{}, {}, {}] });
});

test('Все три счётчика проверяются и суммируются отдельно по локомотивам', () => {
  for (const field of ['energy', 'regen', 'fuel']) {
    assert.equal(meterDelta({ [field+'From']: '2,5', [field+'To']: '1' }, field), -1.5);
  }
  const trips = [{ meters: { mode: 'electric', sections: [{ energyFrom: '1', energyTo: '8', regenFrom: '0', regenTo: '4' }] },
    legs: [{ meters: { mode: 'diesel', sections: [{ fuelFrom: '5', fuelTo: '7,5' }, { fuelFrom: '9', fuelTo: '1' }] } }] }];
  assert.deepEqual(meterTotals(trips), { energy: 7, regen: 4, fuel: 2.5 });
});
