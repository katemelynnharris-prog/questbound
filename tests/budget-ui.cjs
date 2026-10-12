const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={state:{budgetWeek:{week_key:'2026-10-05',today:'2026-10-07',days:{'2026-10-05':'success','2026-10-06':'overspent'},streak:0,best_streak:3,successful_days:1,failed:true,claimed:false,claimable:false}},
 sb:{rpc:async()=>({data:{}})},loadAll:async()=>{},weeklyRoadCard:()=>'<section><div class="weekly-block"><p class="eyebrow">💰 OLD</p></div></section>',wireHomeButtons:()=>{},questRow:()=>'<button data-complete="q">Complete</button>',esc:s=>s,fmt:n=>n,
 document:{addEventListener:()=>{},querySelector:()=>null},screen:{querySelectorAll:()=>[]},setInterval:()=>{},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('canonical-runtime-22.js','utf8'),ctx);
const quest={id:'q',key:'no-overspending-week',title:'Stay within budget',xp_personal:200,xp_campaign:50};
let html=ctx.qbBudgetBlock(quest);
assert.equal((html.match(/data-budget-day=/g)||[]).length,7);
assert.equal((html.match(/data-budget-day="[^"]+" disabled/g)||[]).length,4);
assert.match(html,/Week failed/);assert.match(html,/3<\/b> best streak/);
assert.match(ctx.questRow(quest),/disabled/);
ctx.state.budgetWeek={...ctx.state.budgetWeek,today:'2026-10-11',successful_days:7,failed:false,claimable:true};
html=ctx.qbBudgetBlock(quest);assert.match(html,/<button data-budget-claim >Claim Weekly Reward/);
ctx.state.budgetWeek.claimed=true;ctx.state.budgetWeek.claimable=false;
html=ctx.qbBudgetBlock(quest);assert.equal((html.match(/data-budget-day="[^"]+" disabled/g)||[]).length,7);
assert.match(html,/Week Secured/);
assert.equal(ctx.qbBudgetDate('2026-12-28',6),'2027-01-03');
console.log('Budget UI checks passed');
fs.writeFileSync('/tmp/budget-preview.html','<!doctype html><meta name="viewport" content="width=device-width"><style>body{background:#211d1b;color:#e1d5bd;font-family:Georgia;padding:20px;max-width:600px}button{color:inherit;font:inherit}.weekly-block{padding:20px;border:1px solid #8d7755}.qb-inline-actions{display:flex;gap:10px}button{padding:9px;background:#443b29;border:1px solid #8d7755;border-radius:5px}.fine{font-size:12px;line-height:1.5;opacity:.8}.quest-meta{margin:12px 0}.progress-meta{display:flex;justify-content:space-between}</style><style>'+fs.readFileSync('budget-tracker.css','utf8')+'</style>'+html);
