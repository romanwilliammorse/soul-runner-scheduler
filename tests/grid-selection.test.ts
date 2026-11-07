import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangle} from '../app/availability-grid';

test('reused rectangle selector covers every day and hour in either drag direction',()=>{
 const expected=[18,19,20,42,43,44,66,67,68];
 assert.deepEqual(rectangle(18,68),expected);
 assert.deepEqual(rectangle(68,18),expected);
 assert.deepEqual(rectangle(20,66),expected);
});
test('weekly grid handles single cells, midnight and full week boundaries',()=>{
 assert.deepEqual(rectangle(0,0),[0]);
 assert.deepEqual(rectangle(167,167),[167]);
 assert.deepEqual(rectangle(0,167),Array.from({length:168},(_,n)=>n));
 assert.deepEqual(rectangle(23,47),[23,47]);
});
