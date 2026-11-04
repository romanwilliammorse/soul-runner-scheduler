import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overlapWeek,rankWindows,type OverlapCell} from '../lib/team-availability';
test('overlap compares different zones and distinguishes empty from unanswered',()=>{
 const cells=overlapWeek([{id:'la',name:'LA',timezone:'America/Los_Angeles',slots:[17]},{id:'ny',name:'NY',timezone:'America/New_York',slots:[20]},{id:'empty',name:'Empty',timezone:'UTC',slots:[]},{id:'pending',name:'Pending',timezone:null,slots:null}],'America/Los_Angeles','2026-11-08');
 assert.equal(cells.length,168);assert.deepEqual(cells.find(c=>c.day===0&&c.row==='17:00-0')?.available,['la','ny']);
});
test('fractional offsets require coverage of the full displayed hour',()=>{
 const players=[{id:'india',name:'India',timezone:'Asia/Kolkata',slots:[5]}];
 assert.deepEqual(overlapWeek(players,'UTC','2026-11-08')[0].available,[]);
 players[0].slots.push(6);assert.deepEqual(overlapWeek(players,'UTC','2026-11-08')[0].available,['india']);
});
test('daylight saving preserves both repeated hours and omits nonexistent hours',()=>{
 const fall=overlapWeek([],'America/Los_Angeles','2026-11-01');assert.equal(fall.length,169);assert.ok(fall.some(c=>c.row==='01:00-1'));
 const spring=overlapWeek([],'America/Los_Angeles','2026-03-08');assert.equal(spring.length,167);assert.equal(spring.some(c=>c.day===0&&c.row==='02:00-0'),false);
});
test('half-hour DST transitions never advertise a partial hour as a full game window',()=>{
 const cells=overlapWeek([],'Australia/Lord_Howe','2026-10-04');
 assert.ok(cells.every(c=>c.end-c.start===3600000));
 assert.equal(cells.filter(c=>c.day===0).length,23);
});
function cell(start:number,available:string[]):OverlapCell{return {start:start*3600000,end:(start+1)*3600000,day:0,row:String(start),label:'test',available};}
test('ranked windows require the same people throughout and reject gaps',()=>{
 const cells=[cell(0,['a','b','c']),cell(1,['a','b','d']),cell(3,['a','b','c'])];
 assert.deepEqual(rankWindows(cells,2,2),[{start:0,end:7200000,available:['a','b'],count:2}]);
 assert.deepEqual(rankWindows(cells,3,2),[]);assert.deepEqual(rankWindows(cells,1,3),[]);
});
test('ranked windows prioritize headcount and suppress overlapping duplicate choices',()=>{
 const cells=[cell(0,['a','b']),cell(1,['a','b']),cell(2,['a','b']),cell(6,['a','b','c']),cell(7,['a','b','c'])];
 const ranked=rankWindows(cells,2,2);assert.equal(ranked.length,2);assert.equal(ranked[0].start,6*3600000);assert.equal(ranked[1].start,0);
 assert.deepEqual(rankWindows(cells,0,1),[]);assert.deepEqual(rankWindows(cells,2,4),[]);
});
test('ranked durations span midnight and repeated DST hours using real elapsed time',()=>{
 const overnight=[cell(23,['a','b']),cell(24,['a','b'])];
 assert.deepEqual(rankWindows(overnight,2,2).map(w=>[w.start,w.end]),[[23*3600000,25*3600000]]);
 const repeated=overlapWeek([{id:'a',name:'A',timezone:'America/Los_Angeles',slots:[1]}],'America/Los_Angeles','2026-11-01');
 const window=rankWindows(repeated,1,2)[0];assert.ok(window);assert.equal(window.end-window.start,7200000);
});
