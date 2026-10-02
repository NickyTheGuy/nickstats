"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), vm=require("node:vm"), path=require("node:path");
const root=path.join(__dirname,"..");
const context={window:{},document:{getElementById:()=>null}};
vm.runInNewContext(fs.readFileSync(path.join(root,"js/filters.js"),"utf8"),context);
test("reset returns all profile conditions to defaults while preserving players and view settings",()=>{
 const roster=["nick","friend"], state={side:"T",buy:"hero",heroOnly:true,opponentBuy:"eco",roundResult:"win",roundPhase:"OVERTIME",result:"w",maps:["de_dust2"],comboCondition:"with",players:roster,view:"graphs"};
 const calls=[]; let renders=0;
 const reset=name=>({reset:()=>calls.push(name)});
 context.window.NickStatsFilters.resetProfileFilters({state,mapFilter:reset("map"),dateFilter:{...reset("date"),closeMenus:()=>calls.push("close")},tagFilter:reset("tags"),toggles:[{set:(value,options)=>{assert.equal(value,"ALL");assert.equal(options.notify,false);calls.push("toggle");}}],onReset:()=>renders++});
 for(const key of ["side","buy","opponentBuy","roundResult","roundPhase","result"])assert.equal(state[key],"ALL");
 assert.equal(state.heroOnly,false); assert.equal(state.maps.length,0);assert.equal(state.comboCondition,"without");
 assert.equal(state.players,roster);assert.equal(state.view,"graphs");assert.equal(renders,1);assert.deepEqual(calls,["toggle","map","date","close","tags"]);
});
test("Tags follow Dates and reset is available in Player, history, Groups, and stored matches",()=>{
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 for(const prefix of ["player","group","playerHistory"])assert.ok(html.indexOf(`id="${prefix}DateFilter"`)<html.indexOf(`id="${prefix}ManualFilter"`));
 for(const prefix of ["player","playerHistory","group","match","demo"])assert.ok(html.includes(`id="${prefix}ResetFilters"`));
});
